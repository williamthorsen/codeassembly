import { readFile } from 'node:fs/promises';

import type { CodeAssemblyDeclaration, TypeDeclaration } from './codeassembly-schema.ts';
import { parseCodeAssemblyFile } from './codeassembly-schema.ts';
import { resolveScopeChain } from './scope-chain.ts';

/** The categories the grouped format accepts but does not yet deploy; a non-empty block of any is an error. */
const UNSUPPORTED_CATEGORIES = ['collections'] as const;

/** The effective slug sets a project opts into, one list per deployable category. */
export interface ResolvedDeclaration {
  readonly rulebooks: ReadonlyArray<string>;
  readonly skills: ReadonlyArray<string>;
  readonly subagents: ReadonlyArray<string>;
}

/**
 * Resolves the effective set of slugs a project opts into per deployable category, by combining every
 * `codeassembly.yaml` in the scope chain from lowest to highest precedence in a single pass. Each tier contributes
 * additively via `use`; `drop` subtracts an inherited slug; `root: true` discards every category's lower-precedence
 * contributions before that tier is applied. Each category accumulates independently.
 *
 * Returns `undefined` when no `codeassembly.yaml` exists anywhere in the chain — a total no-op for `sync`, distinct
 * from a present-but-empty declaration, which returns empty lists. The `rulebooks`, `skills`, and `subagents`
 * categories are interpreted; a non-empty `collections` block raises a clear error.
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
  for (const filePath of chain) {
    const declaration = parseCodeAssemblyFile(await readFile(filePath, 'utf8'), filePath);
    assertSupportedCategories(declaration, filePath);

    if (declaration.root) {
      rulebooks.clear();
      skills.clear();
      subagents.clear();
    }
    accumulateType(rulebooks, declaration.rulebooks);
    accumulateType(skills, declaration.skills);
    accumulateType(subagents, declaration.subagents);
  }

  return { rulebooks: [...rulebooks], skills: [...skills], subagents: [...subagents] };
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

/** Throws when a declaration carries a non-empty `collections` block, which the format accepts but does not yet deploy. */
function assertSupportedCategories(declaration: CodeAssemblyDeclaration, filePath: string): void {
  for (const category of UNSUPPORTED_CATEGORIES) {
    const block = declaration[category];
    if (block && (block.use.length > 0 || block.drop.length > 0)) {
      throw new Error(
        `${filePath}: the "${category}" category is declared but not supported in this version; ` +
          'only "rulebooks", "skills", and "subagents" are deployed.',
      );
    }
  }
}

// endregion | Helpers
