import path from 'node:path';

import type { ResolvedDeclaration } from './codeassembly-manifest.ts';
import { assertSupportedContentFormats, type ContentRootRef } from './content-root-manifest.ts';
import { resolvePackageSources } from './package-sources.ts';
import type { ReportLine } from './report-line.ts';
import { describeSourceNameProblem, findSourceProblem } from './source-validation.ts';

/**
 * A resolved content source, and which declaration form introduced it. The form is recorded because it decides what a
 * reader can do about the source: A `sources:` entry names a path that they wrote, while a `packages:` entry names a
 * directory declared by the dependency's own manifest.
 */
export interface DeclaredSource {
  readonly name: string;
  readonly dir: string;
  readonly declaredAs: 'package' | 'path';
}

/** The content sources to which a declaration resolves, the subset whose directory does not exist, and the roots to read. */
export interface DeclaredSources {
  readonly sources: ReadonlyArray<DeclaredSource>;
  readonly missingSources: ReadonlyArray<DeclaredSource>;
  /** The roots from which a command reads undeclared content, highest precedence first: every source whose directory exists. */
  readonly roots: ReadonlyArray<ContentRootRef>;
}

/** The error raised when a declaration leaves a write command without any content source to read. */
export class NoContentSourceError extends Error {
  override readonly name = 'NoContentSourceError';
}

/** Renders a content root for a report line. */
export function describeContentRoot(root: ContentRootRef): string {
  return `source "${root.name}" (${root.dir})`;
}

/**
 * The advisory naming a declared source whose directory does not exist. Reported rather than thrown because the
 * absence may be a not-yet state, and named because the alternative is a run that silently resolves from a
 * lower-precedence source when this one was meant to override it.
 *
 * The remedy is keyed to the declaration form: A `sources:` entry names a path that the reader wrote, while a
 * package's content directory is named by the package's own manifest. The package branch names two actions because a
 * `workspace:*` link resolves into a tree maintained by the reader, while an installed dependency's is not theirs to
 * edit.
 */
export function describeMissingSource(source: DeclaredSource): ReportLine {
  const remedy =
    source.declaredAs === 'package'
      ? "The package's own `codeassembly.content` names that path, so create the directory if this project maintains the " +
        'package, otherwise report the omission upstream or drop the package from `packages`.'
      : "Create the directory, or correct the source's `path` in the declaration that names it.";
  return {
    glyph: 'warning',
    level: 'warn',
    text: `Declared source "${source.name}" (${source.dir}) does not exist. ${remedy}`,
  };
}

/**
 * Resolves a declaration's hand-declared and package sources into one precedence-ordered list, validating every root
 * that the run will read before any file is written. Throws `NoContentSourceError` when the declaration is absent,
 * declares no source, or declares only sources whose directories are missing, because the run would otherwise resolve
 * nothing and retract everything that it deployed before.
 *
 * The checks run in a fixed order, and the order is load-bearing: an unreadable source directory must report as
 * unreadable rather than as a failed content-manifest read. Every caller shares this one entry point rather than the
 * individual checks, so two commands cannot come to disagree about that order.
 */
export async function resolveDeclaredSources(options: {
  baseDir: string;
  declaration: Pick<ResolvedDeclaration, 'packages' | 'sources'> | undefined;
}): Promise<DeclaredSources> {
  const { baseDir, declaration } = options;
  if (declaration === undefined) {
    throw new NoContentSourceError(describeNoSource(baseDir, []));
  }

  // A declared package contributes both a source and a set of seeds: The array below puts its content dir under the
  // hand-declared sources, so a hand-pointed local directory outranks a dependency.
  const packageSources = await resolvePackageSources(declaration.packages, baseDir);
  const sources: ReadonlyArray<DeclaredSource> = [
    ...declaration.sources.map((source): DeclaredSource => ({ ...source, declaredAs: 'path' })),
    ...packageSources.map((source): DeclaredSource => ({ ...source, declaredAs: 'package' })),
  ];

  const missingSources = await checkDeclaredSources(sources);
  assertUsableSourceNames(sources);
  assertDistinctSourceNames(sources);

  // A missing source does not contribute a root: There is nothing to read from it, and the warning above already
  // names it.
  const missingDirs = new Set(missingSources.map((source) => source.dir));
  const roots: ReadonlyArray<DeclaredSource> = sources.filter((source) => !missingDirs.has(source.dir));
  if (roots.length === 0) {
    throw new NoContentSourceError(describeNoSource(baseDir, missingSources));
  }

  // Checked after the source checks above, so an unreadable directory reports as unreadable rather than as a failed
  // manifest read; a source whose directory is missing does not contain a manifest and stays the warning that it is.
  await assertSupportedContentFormats(roots);

  return { sources, missingSources, roots };
}

// region | Helpers

/**
 * Renders the no-source error: what is missing, the file that the declaration belongs in, and an example entry. It
 * also names the gitignored local tier, the place for a path that differs between machines.
 */
function describeNoSource(baseDir: string, missing: ReadonlyArray<DeclaredSource>): string {
  const problem =
    missing.length === 0
      ? 'No content source is declared.'
      : `None of the declared content sources exists: ${missing.map((source) => `"${source.name}" (${source.dir})`).join(', ')}.`;
  const agentsDir = path.join(baseDir, '.agents');
  const file = `${path.join(agentsDir, 'codeassembly.yaml')}, or in ${path.join(agentsDir, 'codeassembly.local.yaml')} for a path that is specific to this machine`;
  return (
    `${problem} Declare a \`sources:\` entry, or a \`packages:\` entry, in ${file}. For example:\n\n` +
    'sources:\n  - name: codeassembly-guidance\n    path: ~/repos/codeassembly/packages/guidance/content\n\n' +
    'A relative `path` resolves against the `.agents/` directory that contains the declaration.'
  );
}

/**
 * Throws when two declared sources share a name, which the hand-declared tier and the package tier can each satisfy
 * independently: Names are unique within a tier, and nothing reconciles one tier's against the other's.
 *
 * A shared name would let both claim one support namespace, so the source that wins artifact resolution and the one
 * whose support files survive delivery are different sources, and links rendered for the first point at the second's
 * files. Failing here, before any write, forces the conflict to be resolved by renaming rather than by delivery order.
 */
function assertDistinctSourceNames(sources: ReadonlyArray<{ name: string; dir: string }>): void {
  const dirsByName = new Map<string, Array<string>>();
  for (const source of sources) {
    dirsByName.set(source.name, [...(dirsByName.get(source.name) ?? []), source.dir]);
  }

  const collisions = dirsByName
    .entries()
    .filter(([, dirs]) => dirs.length > 1)
    .map(([name, dirs]) => `"${name}" (${dirs.join(', ')})`)
    .toArray();

  if (collisions.length > 0) {
    throw new Error(
      `Declared source name(s) claimed more than once: ${collisions.join('; ')}. A source name is the directory ` +
        'under which its support files deploy, so two sources cannot share one. Rename one of them.',
    );
  }
}

/**
 * Throws when a declared source's name cannot serve as the directory segments under which its support entries deploy,
 * so a name that would escape its namespace fails the run (dry-run included) before any file is written. Every
 * offending name is reported together, and a declaration with two of them takes one fix rather than two runs.
 */
function assertUsableSourceNames(sources: ReadonlyArray<{ name: string; dir: string }>): void {
  const unusable = sources
    .map((source) => ({ source, problem: describeSourceNameProblem(source.name) }))
    .filter((entry) => entry.problem !== undefined)
    .map((entry) => `"${entry.source.name}": ${entry.problem}`);

  if (unusable.length > 0) {
    throw new Error(
      `Unusable declared source name(s): ${unusable.join('; ')}. A source name becomes a directory under the ` +
        'harness skills dir, so it must name one.',
    );
  }
}

/**
 * Reports the declared sources whose directory does not exist, and throws when any other source path is a
 * non-directory or unreadable, so a misconfigured source fails the whole run (dry-run included) before any file is
 * touched. The error names each offending source and what is wrong with it.
 *
 * Absence is returned rather than thrown, because it is the one problem that can be a not-yet state: a source declared
 * under version control before anything populates it. Such a source resolves as contributing nothing; the run
 * proceeds and the report warns, which keeps the diagnostic that a mistyped `path:` needs without making the
 * declaration itself illegal.
 */
async function checkDeclaredSources(sources: ReadonlyArray<DeclaredSource>): Promise<ReadonlyArray<DeclaredSource>> {
  const missing: Array<DeclaredSource> = [];
  const invalid: Array<string> = [];
  for (const source of sources) {
    const problem = await findSourceProblem(source.dir);
    if (problem === undefined) {
      continue;
    }
    if (problem.kind === 'missing') {
      missing.push(source);
      continue;
    }
    invalid.push(`"${source.name}" (${source.dir}): ${problem.detail}`);
  }
  if (invalid.length > 0) {
    throw new Error(
      `Invalid declared source(s): ${invalid.join('; ')}. Each source path must be a readable directory.`,
    );
  }
  return missing;
}

// endregion | Helpers
