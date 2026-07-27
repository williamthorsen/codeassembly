/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { EVENT_IMPACT_LEVELS, type EventImpact, isEventImpact } from '@codeassembly/kb/records';

import type { RecallFn } from '../kb-search/recall.ts';
import { recordTypeOf, searchNotes } from '../kb-search/search.ts';
import type { RecallFilters } from '../kb-search/types.ts';
import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { normalizeEvents } from './normalize.ts';
import type { EventCandidate, EventRetrieveResult } from './types.ts';

/** The record type kb-retrieve-events owns; every other type (e.g. `assertion`) is left to its own retrieve command. */
const EVENT = 'event';

/** The flags this helper accepts; positionals join into the free-text query. `--kb` is an alias for `--store`. */
const FLAGS: readonly FlagSpec[] = [
  { name: 'all-kbs', takesValue: false },
  { name: 'min-impact', takesValue: true },
  { name: 'store', aliases: ['kb'], takesValue: true },
  { name: 'tag', takesValue: true },
];

/** Parsed command-line invocation of the kb-retrieve-events helper. */
export interface ParsedArgs {
  /** The free-text query string (all non-flag tokens, joined by spaces). */
  query: string;
  /** Whether `--all-kbs` widened scope to every registered KB. */
  allKbs: boolean;
  /** The registry name from `--store`/`--kb`, scoping recall to that store alone (no cwd-walk); `null` when absent. */
  storeName: string | null;
  /** The mechanical filter from `--tag`. */
  filters: RecallFilters;
  /** The `--min-impact` floor; candidates rated below it (and unrated ones) are dropped. `null` when absent. */
  minImpact: EventImpact | null;
}

/** Executes the helper from `process.argv` and write the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runRetrieveEvents({ argv: process.argv.slice(2), startDir: process.cwd() });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb-retrieve-events: ${message}\n`);
    process.exit(1);
  }
}

// Run as a script, but not when imported by tests.
if (isEntryPoint()) {
  await main();
}

// region | Helpers

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
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
 * Parses the helper's argv into a query, the `--all-kbs` flag, the `--store`/`--kb` store scope, the `--tag` filter, and
 * the `--min-impact` floor. Each value-bearing flag accepts both `--flag value` and `--flag=value`. An unknown flag, a
 * value-bearing flag given no value (or an empty one), or a `--min-impact` outside the declared levels throws with a
 * usage-style message.
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

  const tag = values.tag;
  if (tag === '') {
    throw new Error('--tag requires a value');
  }

  return {
    query: positionals.join(' ').trim(),
    allKbs: flags.some((flag) => flag.name === 'all-kbs'),
    storeName,
    filters: tag !== undefined ? { tag } : {},
    minImpact: parseMinImpact(values['min-impact']),
  };
}

/**
 * Runs the helper end to end: parses args, searches the in-scope knowledge bases through the shared search primitive,
 * projects the event candidate table, and returns the structured result. A no-query, no-KB, or no-match outcome yields
 * an empty candidate list with a `diagnostic` field rather than throwing.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it exists so tests can isolate registry
 * resolution from the developer's environment.
 *
 * @internal - Exported to allow testing.
 */
export async function runRetrieveEvents(input: {
  argv: readonly string[];
  startDir: string;
  home?: string;
  recall?: RecallFn;
}): Promise<EventRetrieveResult> {
  const { query, allKbs, storeName, filters, minImpact } = parseArgs(input.argv);

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

  const eventCandidates = normalizeEvents({ hits: search.hits.filter((hit) => recordTypeOf(hit) === EVENT) });
  const candidates =
    minImpact === null ? eventCandidates : eventCandidates.filter((candidate) => meetsMinImpact(candidate, minImpact));

  const result: EventRetrieveResult = {
    candidates,
    scopedKbs: search.scopedKbs,
    warnings: search.warnings,
  };
  if (candidates.length === 0) {
    result.diagnostic =
      minImpact !== null && eventCandidates.length > 0
        ? `all matches were below the --min-impact threshold of ${minImpact}`
        : emptyResultDiagnostic({ recalledCount: search.recalledCount, filteredHits: search.hits.length });
  }
  return result;
}

/**
 * Phrases the empty-result diagnostic: `no notes matched the query` when recall found nothing; `all matches were
 * filtered out` when the `--tag` filter excluded everything; otherwise the matches were all of another record type, so
 * the reader is pointed at the assertion-recall command.
 */
function emptyResultDiagnostic(input: { recalledCount: number; filteredHits: number }): string {
  if (input.recalledCount === 0) {
    return 'no notes matched the query';
  }
  if (input.filteredHits === 0) {
    return 'all matches were filtered out';
  }
  return 'matches were found but none are events; use kb-retrieve for assertion recall';
}

/** Reports whether a candidate's impact is set and ranks at or above `floor` by the declared level ordering. */
function meetsMinImpact(candidate: EventCandidate, floor: EventImpact): boolean {
  if (candidate.impact === undefined) {
    return false;
  }
  return EVENT_IMPACT_LEVELS.indexOf(candidate.impact) >= EVENT_IMPACT_LEVELS.indexOf(floor);
}

/**
 * Resolves the `--min-impact` value to a level floor, or `null` when the flag is absent. An empty value, or one outside
 * the declared levels, throws a usage-style message.
 */
function parseMinImpact(value: string | undefined): EventImpact | null {
  if (value === undefined) {
    return null;
  }
  if (value === '') {
    throw new Error('--min-impact requires a value');
  }
  if (!isEventImpact(value)) {
    throw new Error(`--min-impact must be one of ${EVENT_IMPACT_LEVELS.join(', ')}`);
  }
  return value;
}

// endregion | Helpers
