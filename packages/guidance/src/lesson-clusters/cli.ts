/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/**
 * CLI entry for lesson clustering, the step that groups feedback events by the lesson that they teach.
 *
 * Two commands, each printing one JSON result: `inventory` writes the events that a clustering pass groups, and
 * `clusters` validates the clusterer's map against that inventory and writes each cluster with its signals. The
 * grouping itself is a judgment that a subagent makes between the two commands.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';
import type { z } from 'zod';

import { readPreferences } from '../derive-session-context/read-preferences.ts';
import { formatMissingStoreMessage } from '../kb-shared/format-missing-store.ts';
import { formatRoleFailure } from '../kb-shared/format-role-failure.ts';
import { resolveCaptureTarget, type ResolveCaptureTargetOutcome } from '../kb-shared/resolve-capture-target.ts';
import { isEntryPoint } from '../lib/is-entry-point.ts';
import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { buildInventory } from './inventory.ts';
import { ClusterMapSchema, InventorySchema } from './schemas.ts';
import { computeSignals } from './signals.ts';
import type { ClusterViolation, Inventory, InventoryEntry, SignalledCluster } from './types.ts';
import { validateClusters } from './validate-clusters.ts';

/** The deferral interval, in days, when neither `--defer-days` nor `triage_feedback.defer_days` sets one. */
export const DEFAULT_DEFER_DAYS = 30;

/** Everything a command reads from its environment, injected so that tests can supply fixtures. */
export interface CommandContext {
  cwd: string;
  home?: string;
  now: Date;
}

/** A command's result: a success payload, or a structured failure that the helper reports at exit 1. */
export type CommandResult =
  | { ok: false; error: string; message: string; violations?: ClusterViolation[] }
  | ({ ok: true } & Record<string, unknown>);

const COMMANDS = ['clusters', 'inventory'] as const;

type FlagName = 'defer-days' | 'inventory' | 'map' | 'out' | 'store';

const FLAG_SPECS: ReadonlyArray<FlagSpec<FlagName>> = [
  { name: 'defer-days', takesValue: true },
  { name: 'inventory', takesValue: true },
  { name: 'map', takesValue: true },
  { name: 'out', takesValue: true },
  { name: 'store', takesValue: true },
];

/** A failure that a command reports as a structured result rather than throwing to `main`. */
class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly violations?: ClusterViolation[],
  ) {
    super(message);
  }
}

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
      case 'clusters':
        return await runClusters(flags, context);
      case 'inventory':
        return await runInventory(flags, context);
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
    '  lesson-clusters clusters --inventory <file> --map <file> [--defer-days <n>] --out <file>',
    '',
    'Commands:',
    '  inventory   Write the open feedback events and the deferred ones, each with a short excerpt',
    '  clusters    Validate the map against the inventory, then write each cluster with its signals',
    '',
    'Options:',
    '  --store <name>       A store registered in kb.yaml; @default or @feedback selects that role',
    '  --inventory <file>   The file that the inventory command wrote',
    '  --map <file>         The cluster map: {"clusters": [{"id", "lesson", "eventIds"}]}',
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
  const inventory = await readJsonFile(flags, 'inventory', InventorySchema, context);
  const map = await readJsonFile(flags, 'map', ClusterMapSchema, context);
  const out = path.resolve(context.cwd, readRequired(flags, 'out'));
  const deferDays = await resolveDeferDays(flags, context);

  const violations = validateClusters(inventory, map);
  if (violations.length > 0) {
    throw new CommandError(
      'invalid-map',
      `the cluster map has ${violations.length} ${violations.length === 1 ? 'violation' : 'violations'}`,
      violations,
    );
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
  const clusters = signalled.filter((cluster) => cluster.signals.status === 'eligible').toSorted(compareClusters);
  const excluded = signalled
    .filter((cluster) => cluster.signals.status === 'deferred-active')
    .toSorted(compareClusters);

  await writeJson(out, { store: inventory.store, deferDays, clusters, excluded });
  return {
    ok: true,
    out,
    deferDays,
    clusters: clusters.length,
    events: clusters.reduce((sum, cluster) => sum + cluster.signals.recurrence, 0),
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

/** Parsed flags: each flag's value. */
type ParsedFlags = ReadonlyMap<FlagName, string>;

/** Orders clusters by recurrence, then by latest capture, newest first, then by id. */
function compareClusters(a: SignalledCluster, b: SignalledCluster): number {
  return (
    b.signals.recurrence - a.signals.recurrence ||
    b.signals.latestCapturedAt.localeCompare(a.signals.latestCapturedAt) ||
    a.id.localeCompare(b.id)
  );
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

/** Reads, parses, and validates the JSON file named by a flag, throwing `file-not-found` or `invalid-file`. */
async function readJsonFile<Schema extends z.ZodType>(
  flags: ParsedFlags,
  flag: FlagName,
  schema: Schema,
  context: CommandContext,
): Promise<z.infer<Schema>> {
  const file = path.resolve(context.cwd, readRequired(flags, flag));
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    throw new CommandError('file-not-found', `could not read ${file}: ${describeError(error)}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new CommandError('invalid-file', `${file} is not JSON: ${describeError(error)}`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new CommandError('invalid-file', `${file}: ${issues.join('; ')}`);
  }
  return parsed.data;
}

/** Returns the value of a required flag, throwing `invalid-args` when it is absent or empty. */
function readRequired(flags: ParsedFlags, flag: FlagName): string {
  const value = flags.get(flag);
  if (value === undefined || value === '') throw new CommandError('invalid-args', `--${flag} <value> is required`);
  return value;
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

/** Maps a store-resolution failure onto the helper's structured failure. */
function resolutionFailure(resolved: Extract<ResolveCaptureTargetOutcome, { ok: false }>): CommandError {
  switch (resolved.reason) {
    case 'missing-store':
      return new CommandError('missing-store', formatMissingStoreMessage(resolved));
    case 'not-registered':
      return new CommandError(
        'store-not-registered',
        resolved.registryError !== undefined
          ? `could not load kb.yaml registry: ${resolved.registryError}`
          : `event store "${resolved.requestedName}" is not registered in kb.yaml`,
      );
    case 'readonly-store':
      return new CommandError(
        'readonly-store',
        `event store "${resolved.name}" is marked readonly in kb.yaml; a triage cannot mark its events`,
      );
    case 'no-default':
    case 'no-feedback': {
      const failure = formatRoleFailure(resolved);
      return new CommandError(failure.error, failure.message);
    }
    default: {
      const _exhaustive: never = resolved;
      throw new Error(`unhandled resolveCaptureTarget failure: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Writes `value` as indented JSON, creating the parent directory. */
async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

// endregion | Helpers
