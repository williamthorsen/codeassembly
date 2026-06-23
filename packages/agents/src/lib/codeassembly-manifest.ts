import { readFile } from 'node:fs/promises';

import type { CodeAssemblyDeclaration } from './codeassembly-schema.ts';
import { parseCodeAssemblyFile } from './codeassembly-schema.ts';
import { resolveScopeChain } from './scope-chain.ts';

/** The categories the grouped format accepts but slice 1 does not yet deploy; a non-empty block of any is an error. */
const UNSUPPORTED_CATEGORIES = ['skills', 'subagents', 'collections'] as const;

/**
 * Resolves the effective set of rulebook slugs a project opts into, by combining every `codeassembly.yaml` in the
 * scope chain from lowest to highest precedence. Each tier contributes additively via `use`; `drop` subtracts an
 * inherited slug; `root: true` discards everything from lower-precedence tiers before that tier is applied.
 *
 * Returns `undefined` when no `codeassembly.yaml` exists anywhere in the chain — a total no-op for `sync`, distinct
 * from a present-but-empty declaration, which returns `[]` (reconcile to nothing declared). Slice 1 interprets only
 * the `rulebooks` category; a non-empty `skills`, `subagents`, or `collections` block raises a clear error.
 *
 * @param options.cwd The project whose `.agents/` tiers are resolved.
 */
export async function resolveRulebookDeclaration(options: { cwd: string }): Promise<ReadonlyArray<string> | undefined> {
  const chain = await resolveScopeChain('codeassembly.yaml', { cwd: options.cwd });
  if (chain.length === 0) {
    return undefined;
  }

  // A Set preserves first-seen order while deduplicating; `delete` powers `drop`, `clear` powers `root`.
  const effective = new Set<string>();
  for (const filePath of chain) {
    const declaration = parseCodeAssemblyFile(await readFile(filePath, 'utf8'), filePath);
    assertOnlyRulebooks(declaration, filePath);

    if (declaration.root) {
      effective.clear();
    }
    for (const entry of declaration.rulebooks?.use ?? []) {
      effective.add(entry.name);
    }
    for (const entry of declaration.rulebooks?.drop ?? []) {
      effective.delete(entry.name);
    }
  }

  return [...effective];
}

// region | Helpers

/**
 * Throws when a declaration carries a non-empty `skills`, `subagents`, or `collections` block. The grouped format
 * accepts these keys so they can be authored ahead of support, but slice 1 deploys only rulebooks; deploying them
 * silently would be worse than a clear failure that names the file and category.
 */
function assertOnlyRulebooks(declaration: CodeAssemblyDeclaration, filePath: string): void {
  for (const category of UNSUPPORTED_CATEGORIES) {
    const block = declaration[category];
    if (block && (block.use.length > 0 || block.drop.length > 0)) {
      throw new Error(
        `${filePath}: the "${category}" category is declared but not supported in this version; ` +
          'only "rulebooks" is deployed.',
      );
    }
  }
}

// endregion | Helpers
