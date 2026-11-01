/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/**
 * CLI entry for lesson clustering, the step that groups feedback events by the lesson that they teach.
 *
 * Two commands, each printing one JSON result: `inventory` writes the events that a clustering pass groups, and
 * `clusters` validates the clusterer's map against that inventory and writes each cluster with its signals. The
 * grouping itself is a judgment that a subagent makes between the two commands.
 */
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { readPreferences } from '../derive-session-context/read-preferences.ts';
import { resolveCaptureTarget } from '../kb-shared/resolve-capture-target.ts';
import { isEntryPoint } from '../lib/is-entry-point.ts';
import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { runBatch, runCombine, runLessons } from './batch-commands.ts';
import { DEFAULT_BATCH_SIZE } from './batches.ts';
import { CANDIDATE_FACTOR, selectCandidates } from './candidates.ts';
import {
  CommandError,
  type CommandResult,
  describeViolations,
  type FlagName,
  type ParsedFlags,
  readJsonFile,
  readPositiveInteger,
  readRequired,
  resolutionFailure,
  writeJson,
} from './command-support.ts';
import { buildInventory } from './inventory.ts';
import { ClusterMapSchema, InventorySchema } from './schemas.ts';
import { computeSignals } from './signals.ts';
import type { Inventory, InventoryEntry, SignalledCluster } from './types.ts';
import { validateClusters } from './validate-clusters.ts';

/** The number of clusters that a run surfaces when `--limit` does not set another. */
export const DEFAULT_LIMIT = 5;

/** The deferral interval, in days, when neither `--defer-days` nor `triage_feedback.defer_days` sets one. */
export const DEFAULT_DEFER_DAYS = 30;

/** Everything a command reads from its environment, injected so that tests can supply fixtures. */
export interface CommandContext {
  cwd: string;
  home?: string;
  now: Date;
}

const COMMANDS = ['batch', 'clusters', 'combine', 'inventory', 'lessons'] as const;

const FLAG_SPECS: ReadonlyArray<FlagSpec<FlagName>> = [
  { name: 'batch-size', takesValue: true },
  { name: 'batches', takesValue: true },
  { name: 'defer-days', takesValue: true },
  { name: 'inventory', takesValue: true },
  { name: 'lessons', takesValue: true },
  { name: 'limit', takesValue: true },
  { name: 'map', takesValue: true },
  { name: 'out', takesValue: true },
  { name: 'store', takesValue: true },
];

/** Executes the helper from `process.argv`, writing the JSON result, or the help, to stdout. */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(buildHelp());
    return;
  }
  try {
    const result = await runCli(argv, { cwd: process.cwd(), now: new Date() });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`lesson-clusters: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, 'lesson-clusters')) {
  await main();
}

/** Runs one command. Invalid arguments, an unresolvable store, and an invalid input file become `{ ok: false }`. */
export async function runCli(argv: readonly string[], context: CommandContext): Promise<CommandResult> {
  const [command, ...rest] = argv;
  try {
    const flags = parseFlags(rest);
    switch (command) {
      case 'batch':
        return await runBatch(flags, context.cwd);
      case 'clusters':
        return await runClusters(flags, context);
      case 'combine':
        return await runCombine(flags, context.cwd);
      case 'inventory':
        return await runInventory(flags, context);
      case 'lessons':
        return await runLessons(flags, context.cwd);
      default:
        throw new CommandError('invalid-args', `expected a command (${COMMANDS.join(', ')}), got "${command ?? ''}"`);
    }
  } catch (error) {
    if (error instanceof CommandError) {
      return {
        ok: false,
        error: error.code,
        message: error.message,
        ...(error.violations !== undefined && { violations: error.violations }),
      };
    }
    return { ok: false, error: 'command-failed', message: describeError(error) };
  }
}

/** Returns the usage text that `--help` prints. */
export function buildHelp(): string {
  return [
    'lesson-clusters: inventory feedback events and turn a cluster map into clusters with signals; prints a JSON result',
    '',
    'Usage:',
    '  lesson-clusters inventory --store <name|@default|@feedback> --out <file>',
    '  lesson-clusters batch --inventory <file> [--batch-size <n>] --out <dir>',
    '  lesson-clusters lessons --batches <dir> --out <file>',
    '  lesson-clusters combine --batches <dir> --lessons <file> --map <file> --out <file>',
    '  lesson-clusters clusters --inventory <file> --map <file> [--limit <n>] [--defer-days <n>] --out <file>',
    '',
    'Commands:',
    '  inventory   Write the open feedback events and the deferred ones, each with a short excerpt',
    '  batch       Split an inventory into batch-NN.json files, grouped by skill, then by capture time',
    '  lessons     Validate each batch-NN.json against its map-NN.json, then write the batch clusters as a lesson inventory',
    '  combine     Validate the merge map against the lesson inventory, then expand it into one event map',
    '  clusters    Validate the map against the inventory, then write the candidate clusters with their signals',
    '',
    'Options:',
    '  --store <name>       A store registered in kb.yaml; @default or @feedback selects that role',
    '  --inventory <file>   The file that the inventory command wrote',
    `  --batch-size <n>     The most events in one batch (default ${DEFAULT_BATCH_SIZE})`,
    '  --batches <dir>      The directory that batch wrote, with a map-NN.json beside each batch-NN.json',
    '  --lessons <file>     The file that the lessons command wrote',
    '  --map <file>         A cluster map: {"clusters": [{"id", "lesson", "eventIds"}]}',
    `  --limit <n>          The clusters that a run surfaces; each signal nominates 4 times as many candidates (default ${DEFAULT_LIMIT})`,
    `  --defer-days <n>     Days for which a deferred cluster stays out; overrides triage_feedback.defer_days (default ${DEFAULT_DEFER_DAYS})`,
    '  --out <file>         Where to write the command output',
    '  -h, --help           Print this help',
    '',
  ].join('\n');
}

/**
 * Validates the map, computes each cluster's signals, and writes the eligible clusters and the excluded ones. Refuses a
 * map with any violation, listing every one, and writes nothing.
 */
async function runClusters(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const inventory = await readJsonFile(flags, 'inventory', InventorySchema, context.cwd);
  const map = await readJsonFile(flags, 'map', ClusterMapSchema, context.cwd);
  const out = path.resolve(context.cwd, readRequired(flags, 'out'));
  const deferDays = await resolveDeferDays(flags, context);

  const violations = validateClusters(inventory, map);
  if (violations.length > 0) {
    throw new CommandError('invalid-map', `the cluster map has ${describeViolations(violations.length)}`, violations);
  }

  const entries = new Map<string, InventoryEntry>(
    [...inventory.pool, ...inventory.deferred].map((entry) => [entry.id, entry]),
  );
  const signalled: SignalledCluster[] = map.clusters.map((cluster) => ({
    ...cluster,
    signals: computeSignals(
      cluster.eventIds.map((id) => lookUp(entries, id)),
      { now: context.now, deferDays },
    ),
  }));
  const eligible = signalled.filter((cluster) => cluster.signals.status === 'eligible').toSorted(compareClusters);
  const excluded = signalled
    .filter((cluster) => cluster.signals.status === 'deferred-active')
    .toSorted(compareClusters);
  const limit = readPositiveInteger(flags, 'limit') ?? DEFAULT_LIMIT;
  const candidateIds = selectCandidates(eligible, CANDIDATE_FACTOR * limit);
  const clusters = eligible.filter((cluster) => candidateIds.has(cluster.id));
  const rest = eligible.filter((cluster) => !candidateIds.has(cluster.id));
  const unranked = { clusters: rest.length, events: countEvents(rest) };

  await writeJson(out, { store: inventory.store, deferDays, limit, clusters, unranked, excluded });
  return {
    ok: true,
    out,
    deferDays,
    clusters: clusters.length,
    events: countEvents(clusters),
    unranked,
    excluded: excluded.length,
  };
}

/** Resolves the store and writes its inventory. */
async function runInventory(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const out = path.resolve(context.cwd, readRequired(flags, 'out'));
  const resolved = await resolveCaptureTarget({
    explicitName: flags.get('store') ?? null,
    ...(context.home !== undefined && { home: context.home }),
  });
  if (!resolved.ok) {
    throw resolutionFailure(resolved);
  }

  const inventory: Inventory = await buildInventory({ storeName: resolved.store.name, storePath: resolved.store.path });
  await writeJson(out, inventory);
  return {
    ok: true,
    out,
    store: inventory.store,
    pool: inventory.pool.length,
    deferred: inventory.deferred.length,
    skipped: inventory.skipped,
  };
}

// region | Helpers

/** Orders clusters by recurrence, then by latest capture, newest first, then by id. */
function compareClusters(a: SignalledCluster, b: SignalledCluster): number {
  return (
    b.signals.recurrence - a.signals.recurrence ||
    b.signals.latestCapturedAt.localeCompare(a.signals.latestCapturedAt) ||
    a.id.localeCompare(b.id)
  );
}

/** Returns the number of events in `clusters`. */
function countEvents(clusters: readonly SignalledCluster[]): number {
  return clusters.reduce((sum, cluster) => sum + cluster.signals.recurrence, 0);
}

/** Returns the inventory entry for `id`, which the map validation has already checked. */
function lookUp(entries: ReadonlyMap<string, InventoryEntry>, id: string): InventoryEntry {
  const entry = entries.get(id);
  if (entry === undefined) throw new Error(`event "${id}" is not in the inventory`);
  return entry;
}

/** Scans the command's flags, refusing a positional argument and a repeated flag. */
function parseFlags(argv: readonly string[]): ParsedFlags {
  let scanned;
  try {
    scanned = scanFlags(argv, FLAG_SPECS);
  } catch (error) {
    throw new CommandError('invalid-args', describeError(error));
  }
  if (scanned.positionals.length > 0) {
    throw new CommandError('invalid-args', `unexpected argument "${scanned.positionals[0]}"`);
  }
  const flags = new Map<FlagName, string>();
  for (const flag of scanned.flags) {
    if (flags.has(flag.name)) throw new CommandError('invalid-args', `--${flag.name} may be given once`);
    flags.set(flag.name, flag.value ?? '');
  }
  return flags;
}

/** Resolves the deferral interval: `--defer-days`, then `triage_feedback.defer_days`, then the default. */
async function resolveDeferDays(flags: ParsedFlags, context: CommandContext): Promise<number> {
  const flag = flags.get('defer-days');
  if (flag !== undefined) {
    const days = Number(flag);
    if (flag === '' || !Number.isSafeInteger(days) || days < 0) {
      throw new CommandError('invalid-args', `--defer-days must be a non-negative integer (got "${flag}")`);
    }
    return days;
  }
  try {
    const { preferences } = await readPreferences({
      cwd: context.cwd,
      ...(context.home !== undefined && { home: context.home }),
    });
    return preferences.triage_feedback?.defer_days ?? DEFAULT_DEFER_DAYS;
  } catch (error) {
    throw new CommandError('invalid-preferences', describeError(error));
  }
}

// endregion | Helpers
