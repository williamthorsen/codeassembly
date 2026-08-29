import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { chainError } from '@williamthorsen/toolbelt.errors/candidate';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { isMissingFile } from './type-guards.ts';

/** The file a content root declares its format in, at the root's top level. */
export const CONTENT_MANIFEST_FILENAME = 'codeassembly-content.yaml';

/**
 * The content formats this tool can deploy. A root declaring anything else is refused, because the contract it was
 * authored against is one this tool does not implement.
 */
export const SUPPORTED_CONTENT_FORMATS: ReadonlyArray<number> = [1];

/** The format a root with no manifest is treated as declaring: the contract that predates the manifest itself. */
const DEFAULT_CONTENT_FORMAT = 1;

/** The rejection every unusable `format` carries, whichever branch failed: a missing key, a non-integer, or one below 1. */
const FORMAT_ERROR = 'format must be a positive integer';

/**
 * The manifest keys this tool reads. `.loose()` so an unknown key passes through: a later tool can add one without an
 * older tool rejecting a file it would otherwise honor, which is what the `format` gate below exists to decide instead.
 * `format` is required, because a manifest that exists states the contract it was authored against; the absence of the
 * whole file, not of the key, is what means format 1.
 */
const ContentRootManifestSchema = z
  .object({
    format: z.int({ error: FORMAT_ERROR }).min(1, FORMAT_ERROR),
  })
  .loose();

/** What disqualifies a content root: which condition holds, and the phrase describing it. */
export interface ContentFormatProblem {
  readonly kind: 'malformed' | 'unsupported';
  readonly detail: string;
}

/** The parsed manifest of a content root. */
export interface ContentRootManifest {
  readonly format: number;
}

/** A content root the format gate checks: its directory, and the source name to attribute a failure to. */
export interface ContentRootRef {
  readonly dir: string;
  readonly name?: string | undefined;
}

/**
 * Throws when any of `roots` declares a content format this tool does not support, or carries a manifest it cannot
 * read, so a mismatch fails a run before any file is written rather than surfacing as an unfilled hook or a dead
 * token. Every offending root is reported together, so a declaration with two of them takes one fix rather than two
 * runs; the two conditions raise separately, because a manifest that will not parse has no declared version to
 * compare and a reader fixing one is not helped by the other.
 */
export async function assertSupportedContentFormats(roots: ReadonlyArray<ContentRootRef>): Promise<void> {
  const problems: Array<{ root: ContentRootRef; problem: ContentFormatProblem }> = [];
  for (const root of roots) {
    const problem = await findContentFormatProblem(root.dir);
    if (problem !== undefined) {
      problems.push({ root, problem });
    }
  }

  const malformed = problems.filter((entry) => entry.problem.kind === 'malformed');
  if (malformed.length > 0) {
    throw new Error(`Unreadable content manifest(s): ${describeProblems(malformed)}.`);
  }

  const unsupported = problems.filter((entry) => entry.problem.kind === 'unsupported');
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported content format(s): ${describeProblems(unsupported)}. This codeassembly supports ` +
        `${describeSupportedFormats()}. Upgrade codeassembly to a version that supports the declared format.`,
    );
  }
}

/** Renders the supported formats for a message, so every caller names them the same way. */
export function describeSupportedFormats(): string {
  return `content format ${SUPPORTED_CONTENT_FORMATS.join(', ')}`;
}

/**
 * Reports what disqualifies the content root at `dir` -- an unreadable manifest, or a format outside the supported
 * set -- or `undefined` when it is deployable. Returned rather than thrown so a caller that reports findings instead
 * of failing (`validate`) shares one classification with the callers that fail.
 */
export async function findContentFormatProblem(dir: string): Promise<ContentFormatProblem | undefined> {
  let manifest: ContentRootManifest;
  try {
    manifest = await readContentRootManifest(dir);
  } catch (error: unknown) {
    return { kind: 'malformed', detail: describeError(error) };
  }

  if (SUPPORTED_CONTENT_FORMATS.includes(manifest.format)) {
    return undefined;
  }
  return { kind: 'unsupported', detail: `declares content format ${manifest.format}` };
}

/**
 * Reads the manifest of the content root at `dir`, resolving an absent one to the default format, and throwing when
 * one is present but cannot be read. Absence is the not-yet state every producer starts in, whereas a manifest that
 * exists and will not parse is a defect wherever it is found.
 */
export async function readContentRootManifest(dir: string): Promise<ContentRootManifest> {
  const manifestPath = path.join(dir, CONTENT_MANIFEST_FILENAME);
  const raw = await readFileIfPresent(manifestPath);
  if (raw === undefined) {
    return { format: DEFAULT_CONTENT_FORMAT };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error: unknown) {
    throw chainError(`Invalid ${manifestPath}: malformed YAML`, error);
  }

  const result = ContentRootManifestSchema.safeParse(parsed ?? {});
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid ${manifestPath}: ${detail}`);
  }
  return { format: result.data.format };
}

// region | Helpers

/** Renders one root's problem as `"name" (dir): detail`, dropping the name a library root has none of. */
function describeProblem(root: ContentRootRef, problem: ContentFormatProblem): string {
  const where = root.name === undefined ? root.dir : `"${root.name}" (${root.dir})`;
  return `${where}: ${problem.detail}`;
}

/** Joins one kind's problems into the clause its error message reports them in. */
function describeProblems(entries: ReadonlyArray<{ root: ContentRootRef; problem: ContentFormatProblem }>): string {
  return entries.map((entry) => describeProblem(entry.root, entry.problem)).join('; ');
}

/**
 * Reads `filePath`, resolving to `undefined` when it is absent. Any other failure -- e.g. `EACCES` on an unreadable
 * manifest -- rethrows, so a permission problem surfaces instead of reading as a bare absence and passing the root as
 * format 1.
 */
async function readFileIfPresent(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

// endregion | Helpers
