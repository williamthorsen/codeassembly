/**
 * Target-set resolution for the revise-prose sweep.
 *
 * The sweep reads what git tracks plus what git would track, which respects `.gitignore` and so keeps `node_modules/`
 * and `dist/` out without a separate exclusion list. Everything mechanical about scope is decided here, so that the
 * detector sees prose alone and the agent never adjudicates a candidate from a file that it may not edit.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { isHarnessDeployPath } from 'codeassembly/api';

import { isInsideArtifactBaseDir, resolveRootArtifactBaseDir } from '../shared/artifact-base-dir.ts';
import { classifyByExtension, classifyByShebang, extractProse } from './extract-prose.ts';
import { UnparsableYamlError } from './extract-yaml.ts';
import { realGit, type ReviseProseGit } from './git.ts';
import { RECORD_PATH } from './record.ts';
import type { ProseKind, ProseSpan, ScannedFile, SkipReason } from './types.ts';

/** A resolved sweep: what it read, what it excluded, and every block of prose that it yielded. */
export interface ProseCollection {
  /** The resolved target set, in git's own order. Nothing outside it may be edited. */
  files: readonly string[];
  /**
   * The files from which the sweep read prose, in the target set's own order, each with the byte count that the batch
   * budget measures.
   */
  scannedFiles: readonly ScannedFile[];
  /** Files excluded, by the reason each was excluded, so that an exclusion is never silent. */
  skipped: Readonly<Record<SkipReason, number>>;
  spans: readonly ProseSpan[];
}

/** Raised when the sweep is asked to run somewhere git does not track. */
export class NotARepositoryError extends Error {}

/**
 * Resolves the target set under `root` and extracts every block of prose from it. `paths` narrows the sweep to the
 * files that those paths name or contain; an empty list sweeps the whole repository. Throws
 * {@link NotARepositoryError} when `root` is not inside a git working tree.
 */
export async function collectProse(input: {
  root: string;
  paths?: readonly string[];
  home?: string;
  git?: ReviseProseGit;
}): Promise<ProseCollection> {
  const home = input.home ?? homedir();
  const artifactBaseDir = await resolveRootArtifactBaseDir(input.root, home);
  const files = resolveTargetFiles({
    root: input.root,
    paths: input.paths ?? [],
    artifactBaseDir,
    git: input.git ?? realGit,
  });

  const spans: ProseSpan[] = [];
  const skipped: Record<SkipReason, number> = {
    generated: 0,
    ineligible: 0,
    'machine-generated': 0,
    unreadable: 0,
    vendored: 0,
  };
  const scannedFiles: ScannedFile[] = [];

  for (const file of files) {
    // The extension decides whether a file is worth reading at all, so an image or an archive is never pulled into
    // a string. Only an extensionless file falls through to the read, at which point a shebang is the one remaining
    // signal.
    const extensionKind = classifyByExtension(file);
    if (extensionKind === undefined && path.extname(file) !== '') {
      skipped.ineligible += 1;
      continue;
    }

    const content = readFileSafely(path.join(input.root, file));
    if (content === undefined) {
      skipped.unreadable += 1;
      continue;
    }

    const kind = extensionKind ?? classifyByShebang(content);
    if (kind === undefined) {
      skipped.ineligible += 1;
      continue;
    }

    if (isGeneratedContent(content, kind)) {
      skipped.generated += 1;
      continue;
    }
    if (isVendoredContent(content, kind)) {
      skipped.vendored += 1;
      continue;
    }
    if (kind !== 'markdown' && hasMachineWidthLines(content)) {
      skipped['machine-generated'] += 1;
      continue;
    }

    let extracted: ProseSpan[];
    try {
      extracted = extractProse({ file, content, kind });
    } catch (error) {
      if (!(error instanceof UnparsableYamlError)) throw error;
      skipped.unreadable += 1;
      continue;
    }

    if (kind === 'yaml' && extracted.length === 0) continue;

    scannedFiles.push({ file, bytes: Buffer.byteLength(content, 'utf8') });
    spans.push(...extracted);
  }

  return { files, scannedFiles, skipped, spans };
}

/**
 * Lists the prose-bearing files under `root` that the sweep may edit: what git tracks plus what it would track, minus
 * the paths that {@link isExcludedPath} rules out. `paths` narrows the listing; an empty list covers the repository.
 */
export function resolveTargetFiles(input: {
  root: string;
  paths: readonly string[];
  artifactBaseDir: string;
  git: ReviseProseGit;
}): string[] {
  let listed: string[];
  try {
    listed = input.git.listFiles(input.root, input.paths);
  } catch {
    throw new NotARepositoryError(`${input.root} is not inside a git working tree; the sweep reads what git tracks`);
  }
  return listed.filter((file) => !isExcludedPath({ file, root: input.root, artifactBaseDir: input.artifactBaseDir }));
}

// region | Helpers

/** The NUL byte, which inside a file's content marks that file as binary. */
const NUL = '\0';

/**
 * Markers stamped into deployed output, each anchored to the start of a line. Every deployment writes its marker on a
 * line of its own: the provenance headline as a `#` or `<!--` comment, and an ownership or guidance-hook marker as an
 * HTML comment. A mention inside a sentence or a code span is prose about the marker, and the file containing it is
 * authored source that the sweep must read.
 */
const DEPLOYMENT_MARKERS: readonly RegExp[] = [
  /^[ \t]*(?:#|\/\/|<!--|\*)?[ \t]*GENERATED FILE\b/m,
  /^[ \t]*<!-- codeassembly-/m,
];

/**
 * Comment openers that may lead a marker, by the kind of file. They differ by kind because a Markdown bullet opens
 * with the same `*` that a block comment's continuation line does, so one alternation spanning every kind would
 * exclude a document that merely lists the markers.
 */
const COMMENT_OPENERS: Readonly<Record<ProseKind, string>> = {
  markdown: `<!--`,
  script: String.raw`\/\/|\/\*+|\*`,
  shell: `#`,
  yaml: `#`,
};

/** Markers written by a code generator into its own output, by the kind of file that each set reads. */
const GENERATOR_MARKERS: Readonly<Record<ProseKind, readonly RegExp[]>> = {
  markdown: buildGeneratorMarkers(COMMENT_OPENERS.markdown),
  script: buildGeneratorMarkers(COMMENT_OPENERS.script),
  shell: buildGeneratorMarkers(COMMENT_OPENERS.shell),
  yaml: buildGeneratorMarkers(COMMENT_OPENERS.yaml),
};

/** Markers stamped on a verbatim extract of another project's file, by the kind of file that each reads. */
const VENDOR_MARKERS: Readonly<Record<ProseKind, RegExp>> = {
  markdown: buildVendorMarker(COMMENT_OPENERS.markdown),
  script: buildVendorMarker(COMMENT_OPENERS.script),
  shell: buildVendorMarker(COMMENT_OPENERS.shell),
  yaml: buildVendorMarker(COMMENT_OPENERS.yaml),
};

/**
 * Line width above which a script is machine-generated rather than authored. A bundler emits a whole module on one
 * line, while a formatted source file stays two orders of magnitude below this. Markdown is exempt: A paragraph on
 * one line is the house convention, not a signal.
 */
const MACHINE_LINE_WIDTH = 1_000;

/** Builds the pattern that opens a marker line: optional indentation, one of the kind's comment openers, and spacing. */
function buildCommentAnchor(openerPattern: string): string {
  return String.raw`^[ \t]*(?:${openerPattern})[ \t]*`;
}

/**
 * Builds the generator markers for one file kind, each held to a comment line whose content the marker opens, so that
 * a file mentioning a marker in a sentence stays in the sweep. `@generated` may follow annotations that the generator
 * wrote first, which is how a compiled kit pairs it with a formatter directive, and the phrase pair may follow the
 * `Code` of the convention's fuller wording. The pair matches without regard to case, which also matches the shouted
 * form; both phrases are required, because a file bounding a generated region announces it as `Generated by` alone and
 * the prose around that region is authored.
 */
function buildGeneratorMarkers(openerPattern: string): readonly RegExp[] {
  const anchor = buildCommentAnchor(openerPattern);
  return [
    new RegExp(String.raw`${anchor}(?:@[\w-]+[^\w\n]*)*@generated\b`, 'm'),
    new RegExp(String.raw`${anchor}(?:code[ \t]+)?generated by\b.*\bdo not edit\b`, 'im'),
  ];
}

/**
 * Builds the vendor marker for one file kind, held to a comment line as the generator markers are. Both phrases are
 * required, because an authored file can say "Do not edit" alone.
 */
function buildVendorMarker(openerPattern: string): RegExp {
  return new RegExp(String.raw`${buildCommentAnchor(openerPattern)}extracted verbatim from\b.*\bdo not edit\b`, 'im');
}

/** Reports whether a script has a line not produced by any formatter, which marks it as bundled output. */
function hasMachineWidthLines(content: string): boolean {
  return content.split('\n').some((line) => line.length > MACHINE_LINE_WIDTH);
}

/**
 * Reports whether `file` is outside what the sweep may edit: a harness's deployed `skills/` or `scripts/` tree, whose
 * source lives elsewhere, the artifact tree, whose files record a moment and stay as written, or the sweep's own
 * record, which the helper writes and whose grounds a subagent may not rewrite.
 */
function isExcludedPath(input: { file: string; root: string; artifactBaseDir: string }): boolean {
  return (
    input.file === RECORD_PATH ||
    isHarnessDeployPath(input.file) ||
    isInsideArtifactBaseDir(path.resolve(input.root, input.file), input.artifactBaseDir)
  );
}

/**
 * Reports whether a file's content marks it as generated, whose edit belongs to the source from which it was
 * produced. The kind decides which comment openers may lead a generator's marker.
 */
function isGeneratedContent(content: string, kind: ProseKind): boolean {
  return (
    DEPLOYMENT_MARKERS.some((marker) => marker.test(content)) ||
    GENERATOR_MARKERS[kind].some((marker) => marker.test(content))
  );
}

/**
 * Reports whether a file's content marks it as a verbatim extract of another project's file, whose edit belongs to
 * that project.
 */
function isVendoredContent(content: string, kind: ProseKind): boolean {
  return VENDOR_MARKERS[kind].test(content);
}

/** Reads a file as UTF-8, returning undefined if it cannot be read or contains a NUL byte, which marks it binary. */
function readFileSafely(absolutePath: string): string | undefined {
  try {
    const content = readFileSync(absolutePath, 'utf8');
    return content.includes(NUL) ? undefined : content;
  } catch {
    return undefined;
  }
}

// endregion | Helpers
