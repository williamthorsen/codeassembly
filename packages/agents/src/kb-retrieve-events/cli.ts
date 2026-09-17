/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { EVENT_IMPACT_LEVELS, type EventImpact, isEventImpact } from '@williamthorsen/kb/records';
import { describeError } from '@williamthorsen/toolbelt.errors';

import type { RecallFn } from '../kb-search/recall.ts';
import { recordTypeOf, searchNotes } from '../kb-search/search.ts';
import type { RecallFilters } from '../kb-search/types.ts';
import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { normalizeEvents } from './normalize.ts';
import type { EventCandidate, EventRetrieveResult } from './types.ts';

const EVENT = 'event';

const FLAGS: readonly FlagSpec[] = [
  { name: 'all-kbs', takesValue: false },
  { name: 'min-impact', takesValue: true },
  { name: 'store', aliases: ['kb'], takesValue: true },
  { name: 'tag', takesValue: true },
];

/** Parsed command-line invocation of the kb-retrieve-events helper. */
export interface ParsedArgs {
  query: string;
  allKbs: boolean;
  storeName: string | null;
  filters: RecallFilters;
  /** The `--min-impact` floor; candidates rated below it (and unrated ones) are dropped. `null` when absent. */
  minImpact: EventImpact | null;
}

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runRetrieveEvents({ argv: process.argv.slice(2), startDir: process.cwd() });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`kb-retrieve-events: ${message}\n`);
    process.exit(1);
  }
}

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
 * Parses the helper's argv, throwing a usage-style message on any defect in it.
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
 * Runs the helper end to end, from the argv to the structured result. Invalid arguments throw; an empty outcome is
 * reported as an empty candidate list with a `diagnostic`.
 *
 * `home` overrides the directory from which the user-global `kb.yaml` is read.
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

/** Phrases the empty-result diagnostic, naming the stage at which the query lost its matches. */
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

/** Resolves the `--min-impact` value to a level floor, or `null` when the flag is absent. */
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
