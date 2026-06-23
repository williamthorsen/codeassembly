import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { parse as parseYaml } from 'yaml';

import type { CodeAssemblyDeclaration } from './codeassembly-schema.ts';
import { parseCodeAssemblyFile } from './codeassembly-schema.ts';
import { resolveScopeChain } from './scope-chain.ts';
import { isEnoent, isRecord } from './type-guards.ts';

/** The categories the grouped format accepts but slice 1 does not yet deploy; a non-empty block of any is an error. */
const UNSUPPORTED_CATEGORIES = ['skills', 'subagents', 'collections'] as const;

/**
 * Resolves the effective set of rulebook slugs a project opts into, by combining every `codeassembly.yaml` in the
 * scope chain from lowest to highest precedence. Each tier contributes additively via `use`; `drop` subtracts an
 * inherited slug; `root: true` discards everything from lower-precedence tiers before that tier is applied.
 *
 * When no `codeassembly.yaml` exists anywhere in the chain, falls back to a legacy flat-format `rulebooks.yaml`
 * at the project root (with a one-time deprecation notice) to keep existing projects working through the rename
 * window. Returns `undefined` when neither file exists — a total no-op for `sync`, distinct from a present-but-empty
 * declaration, which returns `[]` (reconcile to nothing declared). Slice 1 interprets only the `rulebooks`
 * category; a non-empty `skills`, `subagents`, or `collections` block raises a clear error.
 *
 * @param options.cwd The project whose `.agents/` tiers are resolved.
 */
export async function resolveRulebookDeclaration(options: { cwd: string }): Promise<ReadonlyArray<string> | undefined> {
  const chain = await resolveScopeChain('codeassembly.yaml', { cwd: options.cwd });
  if (chain.length === 0) {
    return readLegacyFallback(options.cwd);
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

/** Extracts the slug from a legacy flat entry: a bare string or `{ name: <slug> }` with tolerated extra keys. */
function legacyEntrySlug(entry: unknown, label: string): string {
  if (typeof entry === 'string') {
    return entry;
  }
  if (isRecord(entry) && typeof entry.name === 'string') {
    return entry.name;
  }
  throw new Error(
    `Invalid rulebook entry in ${label}: expected a slug string or { name: <slug> }, got ${JSON.stringify(entry)}`,
  );
}

/** Parses the legacy flat `rulebooks: [..]` shape into a deduplicated slug list. */
function parseLegacyRulebooks(raw: string, label: string): ReadonlyArray<string> {
  const parsed: unknown = parseYaml(raw);
  if (parsed === undefined || parsed === null) {
    return [];
  }
  if (!isRecord(parsed)) {
    throw new TypeError(`Invalid rulebooks.yaml: expected a mapping with a "rulebooks:" key (in ${label})`);
  }

  const declared = parsed.rulebooks;
  if (declared === undefined || declared === null) {
    return [];
  }
  if (!Array.isArray(declared)) {
    throw new TypeError(`Invalid rulebooks.yaml: "rulebooks" must be a list (in ${label})`);
  }

  return [...new Set(declared.map((entry) => legacyEntrySlug(entry, label)))];
}

/**
 * Reads the legacy project-root `rulebooks.yaml` when present, emitting a deprecation notice that points at the
 * `codeassembly.yaml` rename. Returns `undefined` when the legacy file is also absent, preserving the absent-file
 * no-op. This back-compat window is removed in a later change.
 */
async function readLegacyFallback(cwd: string): Promise<ReadonlyArray<string> | undefined> {
  const legacyPath = path.join(cwd, '.agents', 'rulebooks.yaml');
  let raw: string;
  try {
    raw = await readFile(legacyPath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return undefined;
    }
    throw error;
  }

  process.stderr.write(
    '.agents/rulebooks.yaml is deprecated; rename it to codeassembly.yaml and move the list under rulebooks.use.\n',
  );
  return parseLegacyRulebooks(raw, legacyPath);
}

// endregion | Helpers
