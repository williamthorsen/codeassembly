/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { tryLoadKbRegistry } from '@williamthorsen/kb/discovery';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { DEFAULT_KB_SENTINEL } from '../kb-shared/default-kb-sentinel.ts';
import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { loadWorkTypes } from '../lib/work-types.ts';
import { selectExemplars } from './select-exemplars.ts';
import type { SelectResult } from './types.ts';

/** The flags this helper accepts; it reads nothing from stdin. */
const FLAGS: readonly FlagSpec[] = [
  { name: 'count', takesValue: true },
  { name: 'data-dir', takesValue: true },
  { name: 'store', takesValue: true },
  { name: 'type', takesValue: true },
];

/**
 * The event store this helper reads when `--store` names none. The corpus is cross-repo: one store holds every lede
 * decision, whichever repository the pull request merged in.
 */
const LEDE_DECISION_STORE = 'codeassembly';

/**
 * How many exemplars a request returns when `--count` names no number. Exemplars calibrate a drafter, and a larger set
 * dilutes toward an average while spending the drafter's context.
 */
const DEFAULT_COUNT = 5;

/** Parsed command-line invocation of the select-lede-exemplars helper. */
export interface ParsedArgs {
  /** The requested work type, as spelled: a canonical key or a declared alias. */
  type: string;
  count: number;
  /** The corpus to read; falls back to the one this helper serves when `--store` names none. */
  store: string;
  /** Directory holding `work-types.json`; `null` falls back to the helper's own `_data` sibling. */
  dataDir: string | null;
}

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runSelect({ argv: process.argv.slice(2), defaultDataDir: resolveDefaultDataDir() });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`select-lede-exemplars: ${message}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Parses the helper's argv. `--type` is required, because the exemplars a drafter needs are the ones its own work type
 * was written under. `--count`, `--store`, and `--data-dir` each fall back to a default. The `@default` sentinel is
 * refused: it names whichever store a machine defaults to rather than this corpus, and reading the wrong corpus yields
 * plausible exemplars drawn from nothing relevant.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const { positionals, flags } = scanFlags(argv, FLAGS);
  if (positionals[0] !== undefined) {
    throw new Error(`unexpected argument: ${positionals[0]}`);
  }
  const raw = valueFlagMap(flags);
  for (const [name, value] of Object.entries(raw)) {
    if (value === '') {
      throw new Error(`--${name} requires a value`);
    }
  }
  if (raw.store === DEFAULT_KB_SENTINEL) {
    throw new Error(
      `--store ${DEFAULT_KB_SENTINEL} is not accepted: lede exemplars come from the ${LEDE_DECISION_STORE} corpus, ` +
        'not from whichever store kb.yaml names as its default. Omit --store, or name the corpus.',
    );
  }

  const type = raw.type;
  if (type === undefined) {
    throw new Error('--type is required');
  }

  return {
    type,
    count: parseCount(raw.count),
    store: raw.store ?? LEDE_DECISION_STORE,
    dataDir: raw['data-dir'] ?? null,
  };
}

/**
 * Runs the helper end to end: parses args, resolves the requested type through the installed taxonomy, resolves the
 * corpus by registry name, and selects the exemplars.
 *
 * An exhausted corpus returns `ok: true` with an empty list and a diagnostic; only an unusable request or an
 * unreachable corpus returns `ok: false`. System failures (permission denied, unreadable store) propagate to the
 * caller's try/catch.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it exists so tests can isolate registry
 * resolution from the developer's environment.
 *
 * @internal - Exported to allow testing.
 */
export async function runSelect(input: {
  argv: readonly string[];
  defaultDataDir: string;
  home?: string;
}): Promise<SelectResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(input.argv);
  } catch (error) {
    return { ok: false, error: 'invalid-args', message: describeError(error) };
  }

  const dataDir = args.dataDir ?? input.defaultDataDir;
  const workTypes = await loadWorkTypes(dataDir);
  if (workTypes === null) {
    return { ok: false, error: 'no-taxonomy', message: `no readable work-types.json under ${dataDir}` };
  }

  const requested = workTypes.get(args.type);
  if (requested === undefined) {
    return {
      ok: false,
      error: 'unknown-type',
      message: `work type "${args.type}" is not declared in work-types.json, so its tier cannot be resolved`,
    };
  }

  const corpus = await resolveCorpus({ name: args.store, ...(input.home !== undefined && { home: input.home }) });
  if (!corpus.ok) {
    return { ok: false, error: 'store-not-registered', message: corpus.message };
  }

  const selection = await selectExemplars({
    storePath: corpus.store.path,
    workTypes,
    requested,
    count: args.count,
  });

  return {
    ok: true,
    type: requested.key,
    tier: requested.tier,
    widening: selection.widening,
    exemplars: selection.exemplars,
    store: corpus.store.name,
    warnings: selection.warnings,
    ...(selection.exemplars.length === 0 && {
      diagnostic: `no lede decisions were found in the "${corpus.store.name}" corpus`,
    }),
  };
}

// region | Helpers

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. On a `realpathSync` failure the function emits a warning and returns
 * `false`, matching the degrade-with-warning pattern the sibling helpers use.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`select-lede-exemplars: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}

/** Reads the `--count` value as a positive whole number, throwing a usage-style message for anything else. */
function parseCount(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_COUNT;
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('--count must be a whole number of at least 1');
  }
  return count;
}

/**
 * Resolves the corpus by registry name alone: no `.kb/` discovery and no ancestor walk, so a project-local store the
 * invocation happened to sit inside cannot stand in for the corpus. A store marked `readonly` resolves like any other,
 * since that marker refuses writes and nothing here writes.
 */
async function resolveCorpus(input: {
  name: string;
  home?: string;
}): Promise<{ ok: true; store: { name: string; path: string } } | { ok: false; message: string }> {
  const { config, error: registryError } = await tryLoadKbRegistry({
    ...(input.home !== undefined && { home: input.home }),
  });

  const match = config.entries.find((entry) => entry.name === input.name);
  if (match === undefined) {
    return {
      ok: false,
      message:
        registryError === undefined
          ? `event store "${input.name}" is not registered in kb.yaml`
          : `could not load kb.yaml registry: ${registryError}`,
    };
  }
  return { ok: true, store: { name: match.name, path: match.path } };
}

/** Resolves the `_data` directory shipped beside the installed helper, holding the work-type taxonomy. */
function resolveDefaultDataDir(): string {
  const helperDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(helperDir, '..', 'skills', '_data');
}

// endregion | Helpers
