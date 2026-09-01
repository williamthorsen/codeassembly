import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  type DeclarationDomain,
  type DeclarationSource,
  type GuidanceHookBindings,
  parseCodeAssemblyFile,
  type TypeDeclaration,
} from './codeassembly-schema.ts';
import { resolveScopeChain } from './scope-chain.ts';
import { resolveSourcePath } from './source-path.ts';

/**
 * The effective slugs a project declares per artifact type, after combining the scope chain. `rulebooks`, `skills`,
 * and `subagents` are deployable; `collections` are dependency-only aggregates the caller expands into the others.
 * `sources` are the declared content sources, each resolved to an absolute directory, in precedence order (highest
 * first). `packages` are the declared package names in that same precedence order, left unresolved: locating one probes
 * `node_modules`, which is filesystem work this parser deliberately leaves to its caller. `declinedPackages` are the
 * names a tier dropped and no higher tier re-adopted, which distinguishes "declined" from "never mentioned".
 * `guidanceHooks` maps each bound hook name to the rulebooks bound to it, in declaration order; a hook every binding
 * dropped is absent rather than empty, so its presence means something is bound.
 */
export interface ResolvedDeclaration {
  readonly rulebooks: ReadonlyArray<string>;
  readonly skills: ReadonlyArray<string>;
  readonly subagents: ReadonlyArray<string>;
  readonly collections: ReadonlyArray<string>;
  readonly sources: ReadonlyArray<{ name: string; dir: string }>;
  readonly packages: ReadonlyArray<string>;
  readonly declinedPackages: ReadonlyArray<string>;
  readonly guidanceHooks: ReadonlyMap<string, ReadonlyArray<string>>;
}

/**
 * Resolves the effective set of slugs a project declares per artifact type, by combining every `codeassembly.yaml`
 * in the scope chain from lowest to highest precedence in a single pass. Each tier contributes additively via `use`;
 * `drop` subtracts an inherited slug; `root: true` discards every type's lower-precedence contributions before that
 * tier is applied. Each type accumulates independently.
 *
 * Returns the direct, unexpanded sets: a declared collection appears in `collections`, not yet expanded into its
 * members — the caller passes the result to the closure resolver for that. Returns `undefined` when no
 * `codeassembly.yaml` exists anywhere in the chain — a total no-op for `sync`, distinct from a present-but-empty
 * declaration, which returns empty lists.
 *
 * @param options.cwd The project whose `.agents/` tiers are resolved.
 * @param options.domain Which tier pair the chain belongs to, deciding which keys the files may carry.
 */
export async function resolveDeclaration(options: {
  cwd: string;
  domain?: DeclarationDomain;
}): Promise<ResolvedDeclaration | undefined> {
  const chain = await resolveScopeChain('codeassembly.yaml', { cwd: options.cwd });
  if (chain.length === 0) {
    return undefined;
  }

  // A Set preserves first-seen order while deduplicating; `delete` powers `drop`, `clear` powers `root`.
  const rulebooks = new Set<string>();
  const skills = new Set<string>();
  const subagents = new Set<string>();
  const collections = new Set<string>();
  const packages = new Set<string>();
  const declinedPackages = new Set<string>();
  // Sources key on `name` so a repeated name remaps its path; the value is the resolved absolute dir.
  const sources = new Map<string, string>();
  // Each hook name accumulates its own binding set, so a tier binding to one hook leaves the others untouched.
  const guidanceHooks = new Map<string, Set<string>>();
  for (const filePath of chain) {
    const declaration = parseCodeAssemblyFile(await readFile(filePath, 'utf8'), filePath, options.domain);

    if (declaration.root) {
      rulebooks.clear();
      skills.clear();
      subagents.clear();
      collections.clear();
      packages.clear();
      declinedPackages.clear();
      sources.clear();
      guidanceHooks.clear();
    }
    accumulateType(rulebooks, declaration.rulebooks);
    accumulateType(skills, declaration.skills);
    accumulateType(subagents, declaration.subagents);
    accumulateType(collections, declaration.collections);
    accumulatePackages(packages, declinedPackages, declaration.packages);
    accumulateSources(sources, declaration.sources, path.dirname(filePath));
    accumulateGuidanceHooks(guidanceHooks, declaration['guidance-hooks']);
  }

  return {
    rulebooks: [...rulebooks],
    skills: [...skills],
    subagents: [...subagents],
    collections: [...collections],
    // Both accumulate lowest-to-highest tier; reverse so the highest tier and the last declaration within it win, the
    // precedence rule every other block follows.
    packages: [...packages].toReversed(),
    declinedPackages: [...declinedPackages],
    sources: [...sources].toReversed().map(([name, dir]) => ({ name, dir })),
    guidanceHooks: buildGuidanceHookMap(guidanceHooks),
  };
}

// region | Helpers

/**
 * Applies one `guidance-hooks` block to the accumulator, one hook at a time. Each hook's block carries the same
 * `use`/`drop` shape an artifact type does and is accumulated by the same rule, so a binding behaves the way a
 * declaration elsewhere in the file does.
 */
function accumulateGuidanceHooks(effective: Map<string, Set<string>>, block: GuidanceHookBindings | undefined): void {
  const declared = Object.entries(block ?? {});
  for (const [hook, bindings] of declared) {
    const bound = effective.get(hook) ?? new Set<string>();
    accumulateType(bound, bindings);
    effective.set(hook, bound);
  }
}

/**
 * Applies one `packages` block's `use` and `drop` entries to the adopted and declined accumulators, keeping them
 * disjoint: adopting a name clears any earlier decline, and declining one removes it from the adopted set. Tracking
 * declines is what separates a package a project turned down from one it has never mentioned.
 */
function accumulatePackages(adopted: Set<string>, declined: Set<string>, block: TypeDeclaration | undefined): void {
  const adoptions = block?.use ?? [];
  const declines = block?.drop ?? [];
  for (const entry of adoptions) {
    // Re-inserting after a delete moves a repeated name to the end, so its latest declaration sets its precedence.
    adopted.delete(entry.name);
    adopted.add(entry.name);
    declined.delete(entry.name);
  }
  for (const entry of declines) {
    adopted.delete(entry.name);
    declined.add(entry.name);
  }
}

/**
 * Resolves each declared source's `path` against `fileDir` and accumulates it by `name`. Re-inserting after a delete
 * moves a repeated name to the end of the map, so a later (higher-precedence) declaration wins both the path and the
 * position.
 */
function accumulateSources(
  sources: Map<string, string>,
  declared: ReadonlyArray<DeclarationSource>,
  fileDir: string,
): void {
  for (const source of declared) {
    sources.delete(source.name);
    sources.set(source.name, resolveSourcePath(source.path, fileDir));
  }
}

/** Applies one type's `use` (add) and `drop` (subtract) entries to its accumulator, in declaration order. */
function accumulateType(effective: Set<string>, block: TypeDeclaration | undefined): void {
  const additions = block?.use ?? [];
  const subtractions = block?.drop ?? [];
  for (const entry of additions) {
    effective.add(entry.name);
  }
  for (const entry of subtractions) {
    effective.delete(entry.name);
  }
}

/**
 * Freezes the guidance-hook accumulator into its resolved form, omitting a hook a later tier emptied. An empty entry
 * would be indistinguishable from a live binding at every call site downstream, where presence is what says something
 * is bound.
 */
function buildGuidanceHookMap(accumulated: Map<string, Set<string>>): ReadonlyMap<string, ReadonlyArray<string>> {
  return new Map(
    [...accumulated].filter(([, bound]) => bound.size > 0).map(([hook, bound]) => [hook, [...bound]] as const),
  );
}

// endregion | Helpers
