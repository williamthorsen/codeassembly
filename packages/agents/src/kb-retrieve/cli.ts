/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { normalizeHits } from './normalize.ts';
import { recallNotes } from './recall.ts';
import { resolveScope } from './scope.ts';
import type { RecallFilters, RetrieveResult } from './types.ts';

/** Parsed command-line invocation of the kb-retrieve helper. */
export interface ParsedArgs {
  /** The free-text query string (all non-flag tokens, joined by spaces). */
  query: string;
  /** Whether `--all-kbs` widened scope to every registered KB. */
  allKbs: boolean;
  /** The mechanical filters from `--type`, `--tag`, `--folder`. */
  filters: RecallFilters;
}

/**
 * Parse the helper's argv into a query, the `--all-kbs` flag, and the `--type`/`--tag`/`--folder`
 * filters. Each value-bearing flag accepts both `--flag value` and `--flag=value`. An unknown flag or a
 * value-bearing flag with no value throws with a usage-style message.
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
 * Run the helper end to end: parse args, resolve scope, recall via ripgrep, normalize hits, and print
 * the candidate table as JSON to stdout. A no-KB or no-match outcome prints an empty candidate list with
 * a `diagnostic` field rather than throwing. Returns the structured result for in-process callers.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it exists so tests can isolate
 * registry resolution from the developer's environment.
 */
export async function runRetrieve(input: {
  argv: readonly string[];
  startDir: string;
  now: Date;
  home?: string;
}): Promise<RetrieveResult> {
  const { query, allKbs, filters } = parseArgs(input.argv);

  if (query === '') {
    return { candidates: [], scopedKbs: [], diagnostic: 'no query provided' };
  }

  const scopedKbs = await resolveScope({
    startDir: input.startDir,
    allKbs,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (scopedKbs.length === 0) {
    return { candidates: [], scopedKbs, diagnostic: 'no knowledge base configured or discovered' };
  }

  const hits = await recallNotes({ query, scopedKbs });
  const candidates = await normalizeHits({ hits, filters, now: input.now });

  const result: RetrieveResult = { candidates, scopedKbs };
  if (candidates.length === 0) {
    result.diagnostic = 'no notes matched the query';
  }
  return result;
}

// region | Entry point

/** Execute the helper from `process.argv` and write the JSON result to stdout. */
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

/** Match a `--type` / `--tag` / `--folder` flag, returning its key and any inline `=value`. */
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
 * Return true when this module is the process entry point. Both sides are resolved through
 * `realpathSync` so a symlinked invocation path (e.g. a `mktemp` directory under `/var` that resolves
 * to `/private/var`) still matches.
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

// Run as a script, but not when imported by tests.
if (isEntryPoint()) {
  await main();
}

// endregion | Entry point
