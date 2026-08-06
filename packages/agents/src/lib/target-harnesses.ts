import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseCodeAssemblyFile } from './codeassembly-schema.ts';
import { ALL_HARNESS_IDS, detectHarnesses } from './harness.ts';
import { resolveScopeChain } from './scope-chain.ts';
import type { HarnessId, InstallOptions } from './types.ts';

/** What decided a run's harness targeting, so the run can report it rather than leaving the set unexplained. */
export type HarnessTargetOrigin = 'declaration' | 'detection' | 'flag';

/** The harnesses a sync run targets, paired with what decided them. */
export interface ResolvedHarnessTargets {
  readonly harnessIds: ReadonlyArray<HarnessId>;
  readonly origin: HarnessTargetOrigin;
}

/**
 * Resolves which harnesses a sync run targets, in the order: the `--harness` flag, the `harnesses` declaration, then
 * the harnesses installed under `homeDir`. `'all'` is the flag's not-specified sentinel and falls through, so
 * `--harness all` means "do not narrow" rather than "every known harness".
 *
 * Detection reads the home directory rather than `cwd`, because a harness home is created by that harness's own
 * installer while a repository has no reason to hold one. A declaration is honored even when it resolves to an empty
 * set — a run that deploys nowhere on purpose is distinct from one that never declared a target.
 *
 * @param options.cwd The domain's base: the project root for a repo sync, the home directory for a global one.
 */
export async function resolveTargetHarnesses(options: {
  readonly harness: InstallOptions['harness'];
  readonly cwd: string;
  readonly homeDir: string;
}): Promise<ResolvedHarnessTargets> {
  if (options.harness !== 'all') {
    return { harnessIds: [options.harness], origin: 'flag' };
  }

  const declared = await accumulateDeclaredHarnesses(await resolveDeclarationChain(options.cwd, options.homeDir));
  return declared === undefined
    ? { harnessIds: detectHarnesses(options.homeDir), origin: 'detection' }
    : { harnessIds: declared, origin: 'declaration' };
}

// region | Helpers

/** Which tier pair a declaration file belongs to. A file's `root: true` reaches only its own. */
type DeclarationDomain = 'home' | 'project';

/** One declaration file in the machine-wide chain, tagged with the domain whose contributions its `root` may clear. */
interface ChainFile {
  readonly filePath: string;
  readonly domain: DeclarationDomain;
}

/**
 * Folds each file's `harnesses` block into the effective set, lowest precedence first. `use` adds and `drop` subtracts
 * across the domain boundary, so a project-local file can withdraw a home-declared harness. `root: true` clears only
 * what its own domain contributed, which is what keeps a committed project file from discarding the machine's
 * declaration.
 *
 * Returns `undefined` when no file in the chain carried the block, which is what separates a chain declaring nothing
 * (the caller falls back to detection) from one declaring an empty set (the caller honors it).
 */
async function accumulateDeclaredHarnesses(
  chain: ReadonlyArray<ChainFile>,
): Promise<ReadonlyArray<HarnessId> | undefined> {
  // Keyed by harness id, so re-declaring one neither duplicates it nor reorders it; the value records the domain that
  // contributed it, which is what `root` filters on.
  const effective = new Map<HarnessId, DeclarationDomain>();
  let anyDeclared = false;

  for (const { filePath, domain } of chain) {
    const declaration = parseCodeAssemblyFile(await readFile(filePath, 'utf8'), filePath);

    if (declaration.root) {
      // Materialized before deleting, so the walk never mutates the map it is reading.
      const ownContributions = effective
        .entries()
        .filter(([, contributor]) => contributor === domain)
        .map(([harnessId]) => harnessId)
        .toArray();
      for (const harnessId of ownContributions) {
        effective.delete(harnessId);
      }
    }

    if (declaration.harnesses === undefined) {
      continue;
    }
    anyDeclared = true;
    for (const entry of declaration.harnesses.use) {
      effective.set(entry.name, domain);
    }
    for (const entry of declaration.harnesses.drop) {
      effective.delete(entry.name);
    }
  }

  // Ordered canonically rather than by declaration, so the reported set does not vary with authoring order — matching
  // how detection orders its own result.
  return anyDeclared ? ALL_HARNESS_IDS.filter((harnessId) => effective.has(harnessId)) : undefined;
}

/**
 * Lists the declaration files whose `harnesses` blocks compose the machine-wide chain, lowest precedence first: the
 * home tier pair, then the project tier pair. A global sync passes its home directory as `cwd`, so its pair is walked
 * once rather than twice.
 */
async function resolveDeclarationChain(cwd: string, homeDir: string): Promise<ReadonlyArray<ChainFile>> {
  const home: ReadonlyArray<ChainFile> = (await resolveScopeChain('codeassembly.yaml', { cwd: homeDir })).map(
    (filePath) => ({ filePath, domain: 'home' }),
  );
  if (path.resolve(cwd) === path.resolve(homeDir)) {
    return home;
  }

  const project: ReadonlyArray<ChainFile> = (await resolveScopeChain('codeassembly.yaml', { cwd })).map((filePath) => ({
    filePath,
    domain: 'project',
  }));
  return [...home, ...project];
}

// endregion | Helpers
