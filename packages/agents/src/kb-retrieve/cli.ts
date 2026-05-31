/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { normalizeHits } from './normalize.ts';
import { recallNotes } from './recall.ts';
import { resolveScope } from './scope.ts';
import type { RecallFilters, RetrieveResult, ScopedKb } from './types.ts';

/** Parsed command-line invocation of the kb-retrieve helper. */
export interface ParsedArgs {
  /** The free-text query string (all non-flag tokens, joined by spaces). */
  query: string;
  /** Whether `--all-kbs` widened scope to every registered KB. */
  allKbs: boolean;
  /** The mechanical filters from `--type`, `--tag`, `--folder`. */
  filters: RecallFilters;
}

/** Executes the helper from `process.argv` and write the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runRetrieve({
      argv: process.argv.slice(2),
      startDir: process.cwd(),
      now: new Date(),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb-retrieve: ${message}\n`);
    process.exit(1);
  }
}

// Run as a script, but not when imported by tests.
if (isEntryPoint()) {
  await main();
}

// region | Helpers

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so that a
 * symlinked invocation path (e.g. a `mktemp` directory under `/var` that resolves to `/private/var`) still matches.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

/** Matches a `--type`/`--tag`/`--folder` flag, returning its key and any inline `=value`. */
function matchValueFlag(arg: string): { key: keyof RecallFilters; inlineValue: string | null } | null {
  for (const key of ['type', 'tag', 'folder'] as const) {
    if (arg === `--${key}`) {
      return { key, inlineValue: null };
    }
    if (arg.startsWith(`--${key}=`)) {
      return { key, inlineValue: arg.slice(`--${key}=`.length) };
    }
  }
  return null;
}

/**
 * Parses the helper's argv into a query, the `--all-kbs` flag, and the `--type`/`--tag`/`--folder` filters.
 * Each value-bearing flag accepts both `--flag value` and `--flag=value`.
 * An unknown flag or a value-bearing flag with no value throws with a usage-style message.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const queryParts: string[] = [];
  let allKbs = false;
  const filters: RecallFilters = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === '--all-kbs') {
      allKbs = true;
      continue;
    }
    const valueFlag = matchValueFlag(arg);
    if (valueFlag !== null) {
      const { key } = valueFlag;
      let value = valueFlag.inlineValue;
      if (value === null) {
        value = argv[index + 1] ?? null;
        index += 1;
      }
      if (value === null || value === '' || value.startsWith('--')) {
        throw new Error(`--${key} requires a value`);
      }
      filters[key] = value;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`unknown flag: ${arg}`);
    }
    queryParts.push(arg);
  }

  return { query: queryParts.join(' ').trim(), allKbs, filters };
}

/**
 * Runs the helper end to end: Parses args, resolves scope, recalls via ripgrep, normalizes hits, and prints
 * the candidate table as JSON to stdout. A no-KB or no-match outcome prints an empty candidate list with a `diagnostic`
 * field rather than throwing. Returns the structured result for in-process callers.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it exists so tests can isolate registry
 * resolution from the developer's environment.
 *
 * @internal - Exported to allow testing.
 */
export async function runRetrieve(input: {
  argv: readonly string[];
  startDir: string;
  now: Date;
  home?: string;
}): Promise<RetrieveResult> {
  const { query, allKbs, filters } = parseArgs(input.argv);

  if (query === '') {
    return { candidates: [], scopedKbs: [], warnings: [], diagnostic: 'no query provided' };
  }

  const { kbs: inScopeKbs, registryError } = await resolveScope({
    startDir: input.startDir,
    allKbs,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (inScopeKbs.length === 0) {
    // A malformed registry that contributes no entries reads identically to "no registry" in `scopedKbs`, so name
    // the failure in the diagnostic to distinguish a defect to fix from an absent registry.
    const diagnostic =
      registryError === undefined ? 'no knowledge base configured or discovered' : `registry invalid: ${registryError}`;
    return { candidates: [], scopedKbs: [], warnings: composeWarnings({ registryError, missingKbs: [] }), diagnostic };
  }

  const { hits, missingKbs } = await recallNotes({ query, scopedKbs: inScopeKbs });
  const candidates = await normalizeHits({ hits, filters, now: input.now });

  // `scopedKbs` reports the KBs actually searched, so exclude any whose path was missing; the dead paths surface in
  // `warnings` instead.
  const searchedKbs = inScopeKbs.filter((kb) => !missingKbs.some((missing) => missing.path === kb.path));

  const result: RetrieveResult = {
    candidates,
    scopedKbs: searchedKbs,
    warnings: composeWarnings({ registryError, missingKbs }),
  };
  if (candidates.length === 0) {
    // Distinguish a query that found nothing from a query that found hits which were then excluded by
    // `--type` / `--tag` / `--folder`, so the caller knows whether to broaden the query or drop a filter.
    result.diagnostic = hits.length === 0 ? 'no notes matched the query' : 'all matches were filtered out';
  }
  return result;
}

/**
 * Phrases the operator-facing registry-health warnings in deterministic order: the malformed-registry warning first,
 * then one dead-path warning per missing KB in registry/scope order. A named entry reports its name and path; a
 * registry-less discovered KB (`name === null`, only reachable under a TOCTOU race) reports just its path.
 */
function composeWarnings(input: { registryError: string | undefined; missingKbs: ScopedKb[] }): string[] {
  const warnings: string[] = [];
  if (input.registryError !== undefined) {
    warnings.push(`registry invalid: ${input.registryError}`);
  }
  for (const kb of input.missingKbs) {
    warnings.push(
      kb.name === null
        ? `discovered KB path does not exist: ${kb.path}`
        : `registry KB "${kb.name}" path does not exist: ${kb.path}`,
    );
  }
  return warnings;
}

// endregion | Helpers
