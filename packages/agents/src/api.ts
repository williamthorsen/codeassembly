import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { parse as parseYaml } from 'yaml';

import { artifactFrontmatterPath, type ArtifactType as InternalArtifactType } from './lib/artifact-types.ts';
import type { ContentDefectKind as InternalContentDefectKind } from './lib/content-defects.ts';
import { resolveContentDir } from './lib/content-resolver.ts';
import { libraryResolver } from './lib/content-sources.ts';
import { validateContentRoot as validateRoot } from './lib/content-validation.ts';
import { resolveClosure as resolveRootClosure } from './lib/dependency-resolver.ts';
import { expandIncludes } from './lib/directive-expander.ts';
import { parseFrontmatter } from './lib/frontmatter-merger.ts';
import { ALL_HARNESS_IDS } from './lib/harness.ts';
import { listContentRootCatalog, renderContentRoot as renderRoot } from './lib/render-content-root.ts';
import { isRecord } from './lib/type-guards.ts';

/** A kind of artifact that a content root ships. */
export type ArtifactType = InternalArtifactType;

/** One artifact's source, as `readArtifact` reads it. */
export interface ArtifactRead {
  /** The artifact's frontmatter fields, or an empty record when it does not have a frontmatter block. */
  readonly frontmatter: Readonly<Record<string, unknown>>;
  /** The artifact's whole file with its includes expanded, frontmatter block included. */
  readonly body: string;
}

/** A content root's artifact slugs per type. */
export type Catalog = Readonly<Record<ArtifactType, ReadonlyArray<string>>>;

/** One defect that `codeassembly validate` reports. */
export interface ContentDefect {
  /** The path, relative to the content root, to which the defect is attributed. */
  readonly file: string;
  /** Which stage rejected the file. */
  readonly kind: ContentDefectKind;
  readonly detail: string;
}

/** Which stage of validation rejected a file. */
export type ContentDefectKind = InternalContentDefectKind;

/** A harness to which a content root renders. */
export type HarnessId = (typeof HARNESS_IDS)[number];

/** Every harness to which a content root renders. A suite looping over these covers a new harness without an edit. */
export const HARNESS_IDS = ALL_HARNESS_IDS;

/** Options for `renderContentRoot`. */
export interface RenderOptions {
  readonly harness: HarnessId;
  /**
   * Maps each guidance hook to the rulebook slugs bound to it, as a declaration's `guidance-hooks:` does. A bound
   * rulebook may come from the root or from the built-in library. Without bindings, every hook is stripped.
   */
  readonly guidanceHooks?: Readonly<Record<string, ReadonlyArray<string>>>;
}

/** One deployed file as a consumer reads it. */
export interface RenderedEntry {
  /** The file's whole text as deployed, frontmatter block and deployment markers included. */
  readonly body: string;
  /** The parsed frontmatter of a Markdown file that has a frontmatter block; `undefined` for every other file. */
  readonly frontmatter: Readonly<Record<string, unknown>> | undefined;
}

/** A content root's deployed files, keyed by POSIX path relative to the harness home (e.g. `skills/foo/SKILL.md`). */
export type RenderedTree = Readonly<Record<string, RenderedEntry>>;

/**
 * Lists every artifact that `root` ships, per type, collections included. Slugs are filesystem basenames: a skill's
 * directory name, and every other type's file name without `.md`.
 */
export async function listCatalog(root: string): Promise<Catalog> {
  return listContentRootCatalog(root);
}

/**
 * Reads one artifact from `root`: its parsed frontmatter and its source with includes expanded. The body is the
 * source before any per-harness rewrite. Throws when the artifact's file is missing or an include cannot be expanded.
 */
export async function readArtifact(root: string, type: ArtifactType, slug: string): Promise<ArtifactRead> {
  const body = await expandIncludes(path.join(root, artifactFrontmatterPath(type, slug)), root);
  return { frontmatter: parseFrontmatterRecord(body) ?? {}, body };
}

/**
 * Renders everything that `root` ships for one harness, as a consumer declaring all of it receives it: skills with
 * their support files, rulebook-delivered skills, subagents, `skills/` support entries, and the harness guidance file
 * with the root's ambient rulebooks in its ambient region, deployment markers included. Dependency edges into the
 * built-in library resolve, but only the root's own artifacts are rendered.
 *
 * Throws one error naming every file that failed to resolve or render.
 */
export async function renderContentRoot(root: string, options: RenderOptions): Promise<RenderedTree> {
  const bindings = options.guidanceHooks === undefined ? undefined : new Map(Object.entries(options.guidanceHooks));
  const { defects, failures, files } = await renderRoot(root, options.harness, resolveContentDir(), bindings);

  const problems = [
    ...defects.map(({ detail, file }) => `${file}: ${detail}`),
    ...failures.map(({ error, file }) => `${file}: ${describeError(error)}`),
  ];
  if (problems.length > 0) {
    throw new Error(
      `Rendering ${root} for ${options.harness} failed:\n${problems.map((line) => `  ${line}`).join('\n')}`,
    );
  }

  return Object.fromEntries(
    files.map(({ content, path: filePath }) => [
      filePath,
      { body: content, frontmatter: filePath.endsWith('.md') ? parseFrontmatterRecord(content) : undefined },
    ]),
  );
}

/**
 * Resolves the dependency closure of `seeds` within `root`, following `dependencies:`, a collection's `members:`, a
 * subagent's `skills:`, and the invocation tokens in each body. Collections are traversal-only, so the result's
 * `collection` list is always empty. Throws on an edge that resolves nowhere in `root`, or on a cycle.
 */
export async function resolveClosure(root: string, seeds: Partial<Catalog>): Promise<Catalog> {
  const closure = await resolveRootClosure(seeds, libraryResolver(root));
  return { rulebook: closure.rulebooks, skill: closure.skills, subagent: closure.subagents, collection: [] };
}

/**
 * Validates `root` for each of `harnesses`, returning every defect that `codeassembly validate` reports, or an empty
 * list when there are none. The root resolves with the built-in library behind it.
 */
export async function validateContentRoot(
  root: string,
  harnesses: ReadonlyArray<HarnessId>,
): Promise<ReadonlyArray<ContentDefect>> {
  return validateRoot(root, harnesses);
}

// region | Helpers

/** Parses a leading frontmatter block into a record, returning `undefined` when the content does not open with one. */
function parseFrontmatterRecord(content: string): Readonly<Record<string, unknown>> | undefined {
  if (!content.startsWith('---\n')) {
    return undefined;
  }
  const parsed: unknown = parseYaml(parseFrontmatter(content).lines.join('\n'));
  return isRecord(parsed) ? parsed : {};
}

// endregion | Helpers
