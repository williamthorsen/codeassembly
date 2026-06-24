import { readFile } from 'node:fs/promises';

import type { CategoryDeclaration, CodeAssemblyDeclaration } from './codeassembly-schema.ts';
import { parseCodeAssemblyFile } from './codeassembly-schema.ts';
import { resolveScopeChain } from './scope-chain.ts';

/** The categories the grouped format accepts but does not yet deploy; a non-empty block of any is an error. */
const UNSUPPORTED_CATEGORIES = ['subagents', 'collections'] as const;

/** The effective slug sets a project opts into, one list per deployable category. */
export interface ResolvedDeclaration {
  readonly rulebooks: ReadonlyArray<string>;
  readonly skills: ReadonlyArray<string>;
}

/**
 * Resolves the effective set of slugs a project opts into per deployable category, by combining every
 * `codeassembly.yaml` in the scope chain from lowest to highest precedence in a single pass. Each tier contributes
 * additively via `use`; `drop` subtracts an inherited slug; `root: true` discards every category's lower-precedence
 * contributions before that tier is applied. Each category accumulates independently.
 *
 * Returns `undefined` when no `codeassembly.yaml` exists anywhere in the chain — a total no-op for `sync`, distinct
 * from a present-but-empty declaration, which returns empty lists. The `rulebooks` and `skills` categories are
 * interpreted; a non-empty `subagents` or `collections` block raises a clear error.
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
  for (const filePath of chain) {
    const declaration = parseCodeAssemblyFile(await readFile(filePath, 'utf8'), filePath);
    assertSupportedCategories(declaration, filePath);

    if (declaration.root) {
      rulebooks.clear();
      skills.clear();
    }
    accumulateCategory(rulebooks, declaration.rulebooks);
    accumulateCategory(skills, declaration.skills);
  }

  return { rulebooks: [...rulebooks], skills: [...skills] };
}

// region | Helpers

/** Applies one category's `use` (add) and `drop` (subtract) entries to its accumulator, in declaration order. */
function accumulateCategory(effective: Set<string>, category: CategoryDeclaration | undefined): void {
  for (const entry of category?.use ?? []) {
    effective.add(entry.name);
  }
  for (const entry of category?.drop ?? []) {
    effective.delete(entry.name);
  }
}

/** Throws when a declaration carries a non-empty `subagents` or `collections` block, which the format accepts but does not yet deploy. */
function assertSupportedCategories(declaration: CodeAssemblyDeclaration, filePath: string): void {
  for (const category of UNSUPPORTED_CATEGORIES) {
    const block = declaration[category];
    if (block && (block.use.length > 0 || block.drop.length > 0)) {
      throw new Error(
        `${filePath}: the "${category}" category is declared but not supported in this version; ` +
          'only "rulebooks" and "skills" are deployed.',
      );
    }
  }
}

// endregion | Helpers
