/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { searchNotes } from '../kb-search/search.ts';
import type { RecallFilters } from '../kb-search/types.ts';
import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { normalizeHits } from './normalize.ts';
import type { RetrieveResult } from './types.ts';

/** The flags this helper accepts; positionals join into the free-text query. `--kb` is an alias for `--store`. */
const FLAGS: readonly FlagSpec[] = [
  { name: 'all-kbs', takesValue: false },
  { name: 'store', aliases: ['kb'], takesValue: true },
  { name: 'diataxis', takesValue: true },
  { name: 'tag', takesValue: true },
  { name: 'folder', takesValue: true },
];

/** Parsed command-line invocation of the kb-retrieve helper. */
export interface ParsedArgs {
  /** The free-text query string (all non-flag tokens, joined by spaces). */
  query: string;
  /** Whether `--all-kbs` widened scope to every registered KB. */
  allKbs: boolean;
  /** The registry name from `--store`/`--kb`, scoping recall to that store alone (no cwd-walk); `null` when absent. */
  storeName: string | null;
  /** The mechanical filters from `--diataxis`, `--tag`, `--folder`. */
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

/**
 * Parses the helper's argv into a query, the `--all-kbs` flag, the `--store`/`--kb` store scope, and the
 * `--diataxis`/`--tag`/`--folder` filters. Each value-bearing flag accepts both `--flag value` and `--flag=value`.
 * An unknown flag, or a value-bearing flag given no value (or an empty one), throws with a usage-style message.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const { positionals, flags } = scanFlags(argv, FLAGS);
  const values = valueFlagMap(flags);

  const storeName = values.store ?? null;
  if (storeName === '') {
    throw new Error('--store requires a value');
  }

  const filters: RecallFilters = {};
  for (const key of ['diataxis', 'tag', 'folder'] as const) {
    const value = values[key];
    if (value === '') {
      throw new Error(`--${key} requires a value`);
    }
    if (value !== undefined) {
      filters[key] = value;
    }
  }

  return {
    query: positionals.join(' ').trim(),
    allKbs: flags.some((flag) => flag.name === 'all-kbs'),
    storeName,
    filters,
  };
}

/**
 * Runs the helper end to end: parses args, searches the in-scope knowledge bases through the shared search primitive,
 * projects the assertion candidate table, and returns the structured result. A no-query, no-KB, or no-match outcome
 * yields an empty candidate list with a `diagnostic` field rather than throwing.
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
  const { query, allKbs, storeName, filters } = parseArgs(input.argv);

  if (query === '') {
    return { candidates: [], scopedKbs: [], warnings: [], diagnostic: 'no query provided' };
  }

  const search = await searchNotes({
    query,
    allKbs,
    filters,
    startDir: input.startDir,
    ...(storeName !== null && { storeName }),
    ...(input.home !== undefined && { home: input.home }),
  });

  if (search.emptyScopeDiagnostic !== undefined) {
    return {
      candidates: [],
      scopedKbs: search.scopedKbs,
      warnings: search.warnings,
      diagnostic: search.emptyScopeDiagnostic,
    };
  }

  const candidates = await normalizeHits({ hits: search.hits, now: input.now });

  const result: RetrieveResult = {
    candidates,
    scopedKbs: search.scopedKbs,
    warnings: search.warnings,
  };
  if (candidates.length === 0) {
    // Distinguish a query that found nothing from a query that found hits which were then excluded by
    // `--diataxis` / `--tag` / `--folder`, so the caller knows whether to broaden the query or drop a filter.
    result.diagnostic = search.recalledCount === 0 ? 'no notes matched the query' : 'all matches were filtered out';
  }
  return result;
}

// endregion | Helpers
