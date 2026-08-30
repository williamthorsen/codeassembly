import type { ResolvedDeclaration } from './codeassembly-manifest.ts';
import { assertSupportedContentFormats } from './content-root-manifest.ts';
import { resolvePackageSources } from './package-sources.ts';
import type { ReportLine } from './report-line.ts';
import { describeSourceNameProblem, findSourceProblem } from './source-validation.ts';

/**
 * A resolved content source, and which declaration form introduced it. The form is carried because it decides what a
 * reader can do about the source: a `sources:` entry names a path they wrote, while a `packages:` entry names a
 * directory the dependency's own manifest declares.
 */
export interface DeclaredSource {
  readonly name: string;
  readonly dir: string;
  readonly declaredAs: 'package' | 'path';
}

/** The content sources a declaration resolves to, and the subset whose directory does not exist. */
export interface DeclaredSources {
  readonly sources: ReadonlyArray<DeclaredSource>;
  readonly missingSources: ReadonlyArray<DeclaredSource>;
}

/**
 * The advisory naming a declared source whose directory does not exist. Reported rather than thrown because the
 * absence may be a not-yet state, and named because the alternative is a run that silently resolves from the library
 * where the source was meant to override it.
 *
 * The remedy is keyed to the declaration form: a `sources:` entry names a path the reader wrote, while a package's
 * content directory is named by the package's own manifest. The package branch names two actions because a
 * `workspace:*` link resolves into a tree the reader maintains, while an installed dependency's is not theirs to edit.
 */
export function describeMissingSource(source: DeclaredSource): ReportLine {
  const remedy =
    source.declaredAs === 'package'
      ? "The package's own `codeassembly.content` names that path, so create the directory if you maintain the " +
        'package, otherwise report the omission upstream or drop the package from `packages`.'
      : "Create the directory, or correct the source's `path` in the declaration that names it.";
  return {
    level: 'warn',
    text: `⚠️ Declared source "${source.name}" (${source.dir}) does not exist. ${remedy}`,
  };
}

/**
 * Resolves a declaration's hand-declared and package sources into one precedence-ordered list, validating every root
 * the run will read before any file is written. An absent declaration resolves to no sources, which is what leaves a
 * command with no declaration reading the library alone.
 *
 * The checks run in a fixed order, and the order is load-bearing: an unreadable source directory must report as
 * unreadable rather than as a failed content-manifest read. Every caller shares this one entry point rather than the
 * individual checks, so no two commands can come to disagree about that order.
 */
export async function resolveDeclaredSources(options: {
  baseDir: string;
  contentDir: string;
  declaration: Pick<ResolvedDeclaration, 'packages' | 'sources'> | undefined;
}): Promise<DeclaredSources> {
  const { baseDir, contentDir, declaration } = options;
  if (declaration === undefined) {
    await assertSupportedContentFormats([{ dir: contentDir }]);
    return { sources: [], missingSources: [] };
  }

  // A declared package contributes both a source and a set of seeds: Its content dir joins the search order below the
  // hand-declared sources, so a hand-pointed local directory outranks a dependency.
  const packageSources = await resolvePackageSources(declaration.packages, baseDir);
  const sources: ReadonlyArray<DeclaredSource> = [
    ...declaration.sources.map((source): DeclaredSource => ({ ...source, declaredAs: 'path' })),
    ...packageSources.map((source): DeclaredSource => ({ ...source, declaredAs: 'package' })),
  ];

  const missingSources = await checkDeclaredSources(sources);
  assertUsableSourceNames(sources);
  assertDistinctSourceNames(sources);
  // Every root the run reads declares the content format it was authored against, the library included. Checked after
  // the source checks above, so an unreadable directory reports as unreadable rather than as a failed manifest read;
  // a source whose directory is missing carries no manifest and stays the warning it is.
  await assertSupportedContentFormats([...sources, { dir: contentDir }]);

  return { sources, missingSources };
}

// region | Helpers

/**
 * Throws when two declared sources share a name, which the hand-declared tier and the package tier can each satisfy
 * independently: names are unique within a tier, and nothing reconciles one tier's against the other's.
 *
 * A shared name would let both claim one support namespace, so the source that wins artifact resolution and the one
 * whose support files survive delivery are different sources, and links rendered for the first reach the second's
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
      `Declared source name(s) claimed more than once: ${collisions.join('; ')}. A source name is the directory its ` +
        'support files deploy under, so two sources cannot share one. Rename one of them.',
    );
  }
}

/**
 * Throws when a declared source's name cannot serve as the directory segments its support entries deploy under, so a
 * name that would escape its namespace fails the run — dry-run included — before any file is written. Every offending
 * name is reported together, so a declaration with two of them takes one fix rather than two runs.
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
 * under version control before anything populates it. Such a source resolves as contributing nothing, so the run
 * proceeds and the report warns, which keeps the diagnostic a mistyped `path:` needs without making the declaration
 * itself illegal.
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
