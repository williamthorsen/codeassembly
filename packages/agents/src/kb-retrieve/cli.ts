/* eslint n/no-process-exit: off -- CLI entry point: the helper's resolved exit code must reach the OS, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import type { RecallFn } from '../kb-search/recall.ts';
import { recordTypeOf, searchNotes } from '../kb-search/search.ts';
import type { RecallFilters } from '../kb-search/types.ts';
import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { normalizeHits } from './normalize.ts';
import { collectTypelessCandidates } from './typeless-tolerance.ts';
import type { RetrieveResult } from './types.ts';

const ASSERTION = 'assertion';

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
  /** The registry name from `--store`/`--kb`, scoping recall to that store alone; `null` when absent. */
  storeName: string | null;
  filters: RecallFilters;
}

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runRetrieve({
      argv: process.argv.slice(2),
      startDir: process.cwd(),
      now: new Date(),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`kb-retrieve: ${message}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

// region | Helpers

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so that a
 * symlinked invocation path still matches.
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
 * Parses the helper's argv, throwing on any defect in it.
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
 * Runs the helper end to end, from argv to the candidate table. A result with no candidates states the cause in its
 * `diagnostic`.
 *
 * @internal - Exported to allow testing.
 */
export async function runRetrieve(input: {
  argv: readonly string[];
  startDir: string;
  now: Date;
  home?: string;
  recall?: RecallFn;
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
    ...(input.recall !== undefined && { recall: input.recall }),
  });

  if (search.emptyScopeDiagnostic !== undefined) {
    return {
      candidates: [],
      scopedKbs: search.scopedKbs,
      warnings: search.warnings,
      diagnostic: search.emptyScopeDiagnostic,
    };
  }

  // kb-retrieve owns assertions; a record of another declared type belongs to its own retrieve command.
  const assertionHits = search.hits.filter((hit) => recordTypeOf(hit) === ASSERTION);
  const typelessHits = search.hits.filter((hit) => recordTypeOf(hit) === '');
  const candidates = [
    ...(await normalizeHits({ hits: assertionHits, now: input.now })),
    ...(await collectTypelessCandidates({ hits: typelessHits, now: input.now })),
  ];

  const result: RetrieveResult = {
    candidates,
    scopedKbs: search.scopedKbs,
    warnings: search.warnings,
  };
  if (candidates.length === 0) {
    result.diagnostic = emptyResultDiagnostic({
      recalledCount: search.recalledCount,
      filteredHits: search.hits.length,
    });
  }
  return result;
}

/**
 * Phrases the empty-result diagnostic, naming which stage emptied the table: recall, the mechanical filters, or the
 * record-type projection.
 */
function emptyResultDiagnostic(input: { recalledCount: number; filteredHits: number }): string {
  if (input.recalledCount === 0) {
    return 'no notes matched the query';
  }
  if (input.filteredHits === 0) {
    return 'all matches were filtered out';
  }
  return 'matches were found but none are assertions; use kb-retrieve-events for event recall';
}

// endregion | Helpers
