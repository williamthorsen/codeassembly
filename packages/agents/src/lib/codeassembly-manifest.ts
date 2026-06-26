import { readFile } from 'node:fs/promises';

import type { TypeDeclaration } from './codeassembly-schema.ts';
import { parseCodeAssemblyFile } from './codeassembly-schema.ts';
import { resolveScopeChain } from './scope-chain.ts';

/**
 * The effective slugs a project declares per artifact type, after combining the scope chain. `rulebooks`, `skills`,
 * and `subagents` are deployable; `collections` are dependency-only aggregates the caller expands into the others.
 */
export interface ResolvedDeclaration {
  readonly rulebooks: ReadonlyArray<string>;
  readonly skills: ReadonlyArray<string>;
  readonly subagents: ReadonlyArray<string>;
  readonly collections: ReadonlyArray<string>;
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
  for (const filePath of chain) {
    const declaration = parseCodeAssemblyFile(await readFile(filePath, 'utf8'), filePath);

    if (declaration.root) {
      rulebooks.clear();
      skills.clear();
      subagents.clear();
      collections.clear();
    }
    accumulateType(rulebooks, declaration.rulebooks);
    accumulateType(skills, declaration.skills);
    accumulateType(subagents, declaration.subagents);
    accumulateType(collections, declaration.collections);
  }

  return { rulebooks: [...rulebooks], skills: [...skills], subagents: [...subagents], collections: [...collections] };
}

// region | Helpers

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
