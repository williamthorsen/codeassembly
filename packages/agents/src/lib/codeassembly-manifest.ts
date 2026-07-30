import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { DeclarationSource, TypeDeclaration } from './codeassembly-schema.ts';
import { parseCodeAssemblyFile } from './codeassembly-schema.ts';
import { resolveScopeChain } from './scope-chain.ts';
import { resolveSourcePath } from './source-path.ts';

/**
 * The effective slugs a project declares per artifact type, after combining the scope chain. `rulebooks`, `skills`,
 * and `subagents` are deployable; `collections` are dependency-only aggregates the caller expands into the others.
 * `sources` are the declared content sources, each resolved to an absolute directory, in precedence order (highest
 * first). `packages` are the declared package names, left unresolved: locating one probes `node_modules`, which is
 * filesystem work this parser deliberately leaves to its caller.
 */
export interface ResolvedDeclaration {
  readonly rulebooks: ReadonlyArray<string>;
  readonly skills: ReadonlyArray<string>;
  readonly subagents: ReadonlyArray<string>;
  readonly collections: ReadonlyArray<string>;
  readonly sources: ReadonlyArray<{ name: string; dir: string }>;
  readonly packages: ReadonlyArray<string>;
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
 */
export async function resolveDeclaration(options: { cwd: string }): Promise<ResolvedDeclaration | undefined> {
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
  // Sources key on `name` so a repeated name remaps its path; the value is the resolved absolute dir.
  const sources = new Map<string, string>();
  for (const filePath of chain) {
    const declaration = parseCodeAssemblyFile(await readFile(filePath, 'utf8'), filePath);

    if (declaration.root) {
      rulebooks.clear();
      skills.clear();
      subagents.clear();
      collections.clear();
      packages.clear();
      sources.clear();
    }
    accumulateType(rulebooks, declaration.rulebooks);
    accumulateType(skills, declaration.skills);
    accumulateType(subagents, declaration.subagents);
    accumulateType(collections, declaration.collections);
    accumulateType(packages, declaration.packages);
    accumulateSources(sources, declaration.sources, path.dirname(filePath));
  }

  return {
    rulebooks: [...rulebooks],
    skills: [...skills],
    subagents: [...subagents],
    collections: [...collections],
    packages: [...packages],
    // The map is insertion-ordered lowest-to-highest precedence; reverse it so the highest-precedence source is first.
    sources: [...sources].toReversed().map(([name, dir]) => ({ name, dir })),
  };
}

// region | Helpers

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
  for (const entry of block?.use ?? []) {
    effective.add(entry.name);
  }
  for (const entry of block?.drop ?? []) {
    effective.delete(entry.name);
  }
}

// endregion | Helpers
