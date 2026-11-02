/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/**
 * CLI entry for the curation of feedback events, which culls the events that guidance covers, that duplicate an
 * addressed event, or that are obsolete.
 *
 * Five commands, each printing one JSON result: `references` lists the addressed events to which a duplicate can point,
 * `pin` pins each guidance repository at its default branch, `assign` groups the clusters into judge assignments,
 * `validate` checks the judges' bins and writes the curation record, and `render` writes the artifact body. The helper
 * does not write to a store: The skill marks events through `kb-update-events`.
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { resolveCaptureTarget } from '../kb-shared/resolve-capture-target.ts';
import { CommandError, readJsonPath, resolutionFailure, writeJson } from '../lesson-clusters/command-support.ts';
import { ClusterMapSchema, InventorySchema } from '../lesson-clusters/schemas.ts';
import { validateClusters } from '../lesson-clusters/validate-clusters.ts';
import { isEntryPoint } from '../lib/is-entry-point.ts';
import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { buildAssignments, DEFAULT_GROUP_SIZE, formatSequence } from './assign.ts';
import { BinsError, buildRecord, checkBins, type JudgedAssignment } from './bins.ts';
import { type CurateGit, realGit } from './git.ts';
import { pinSources } from './pin.ts';
import { buildReferences } from './references.ts';
import { formatCounts, renderArtifact } from './render.ts';
import { AssignmentSchema, BinsFileSchema, PinsFileSchema, RecordSchema, ReferencesFileSchema } from './schemas.ts';
import type { BinViolation } from './types.ts';

/** Everything a command reads from its environment, injected so that tests can supply fixtures. */
export interface CommandContext {
  cwd: string;
  home?: string;
  git?: CurateGit;
}

/** A command's result: a success payload, or a structured failure that the helper reports at exit 1. */
export type CommandResult =
  { ok: false; error: string; message: string; violations?: BinViolation[] } | ({ ok: true } & Record<string, unknown>);

const COMMANDS = ['assign', 'pin', 'references', 'render', 'validate'] as const;

type FlagName =
  'assignments' | 'file' | 'group-size' | 'inventory' | 'map' | 'out' | 'pins' | 'references' | 'source' | 'store';

const FLAG_SPECS: ReadonlyArray<FlagSpec<FlagName>> = [
  { name: 'assignments', takesValue: true },
  { name: 'file', takesValue: true },
  { name: 'group-size', takesValue: true },
  { name: 'inventory', takesValue: true },
  { name: 'map', takesValue: true },
  { name: 'out', takesValue: true },
  { name: 'pins', takesValue: true },
  { name: 'references', takesValue: true },
  { name: 'source', takesValue: true },
  { name: 'store', takesValue: true },
];

/** The flags that a command may repeat. */
const REPEATABLE: ReadonlySet<FlagName> = new Set(['source']);

/** Executes the helper from `process.argv`, writing the JSON result, or the help, to stdout. */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(buildHelp());
    return;
  }
  try {
    const result = await runCli(argv, { cwd: process.cwd() });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`curate-feedback: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, 'curate-feedback')) {
  await main();
}

/** Runs one command. Invalid arguments and missing or malformed inputs become `{ ok: false }`. */
export async function runCli(argv: readonly string[], context: CommandContext): Promise<CommandResult> {
  const [command, ...rest] = argv;
  try {
    const flags = parseFlags(rest);
    switch (command) {
      case 'assign':
        return await runAssign(flags, context);
      case 'pin':
        return await runPin(flags, context);
      case 'references':
        return await runReferences(flags, context);
      case 'render':
        return await runRender(flags, context);
      case 'validate':
        return await runValidate(flags, context);
      default:
        throw new CommandError('invalid-args', `expected a command (${COMMANDS.join(', ')}), got "${command ?? ''}"`);
    }
  } catch (error) {
    if (error instanceof BinsError) {
      return { ok: false, error: 'invalid-bins', message: error.message, violations: error.violations };
    }
    if (error instanceof CommandError) {
      return { ok: false, error: error.code, message: error.message };
    }
    return { ok: false, error: 'command-failed', message: describeError(error) };
  }
}

/** Returns the usage text that `--help` prints. */
export function buildHelp(): string {
  return [
    'curate-feedback: prepare, check, and record a curation of feedback events; prints a JSON result',
    '',
    'Usage:',
    '  curate-feedback references --store <name> --out <file>',
    '  curate-feedback pin --source <dir> [--source <dir>...] --out <file>',
    '  curate-feedback assign --inventory <file> --map <file> --references <file> --pins <file> --out <dir> [--group-size <n>]',
    '  curate-feedback validate --assignments <dir> --out <record.json>',
    '  curate-feedback render --file <record.json> --out <file>',
    '',
    'Commands:',
    '  references   List the addressed feedback events to which a duplicate can point, with their eligible references',
    '  pin          Pin the repository of each source directory at the commit of its default branch',
    '  assign       Group the clusters into judge assignments of whole clusters',
    '  validate     Check each bins file against its assignment, then write the curation record',
    '  render       Write the curation artifact body',
    '',
    'Options:',
    '  --store <name>         The event store: a registry name, @default, or @feedback',
    '  --source <dir>         A guidance source directory; repeatable',
    '  --inventory <file>     The lesson-clusters inventory',
    '  --map <file>           The lesson-clusters event map',
    '  --references <file>    The references file',
    '  --pins <file>          The pins file',
    `  --group-size <n>       The most events in one assignment (default ${DEFAULT_GROUP_SIZE})`,
    '  --assignments <dir>    The directory of assignment-NN.json and bins-NN.json files',
    '  --file <record.json>   The curation record',
    '  --out <path>           Where to write the command output',
    '  -h, --help             Print this help',
    '',
  ].join('\n');
}

// -- Commands --

/** Writes one assignment file per group of clusters. */
async function runAssign(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const inventory = await readJsonPath(resolveFlag(flags, 'inventory', context), InventorySchema);
  const map = await readJsonPath(resolveFlag(flags, 'map', context), ClusterMapSchema);
  const references = await readJsonPath(resolveFlag(flags, 'references', context), ReferencesFileSchema);
  const pins = await readJsonPath(resolveFlag(flags, 'pins', context), PinsFileSchema);
  const violations = validateClusters(inventory, map);
  if (violations.length > 0) {
    throw new CommandError('invalid-map', violations.map((violation) => violation.message).join('; '));
  }
  const groupSize = readPositiveInteger(flags, 'group-size') ?? DEFAULT_GROUP_SIZE;
  const out = resolveFlag(flags, 'out', context);
  const assignments = buildAssignments({
    inventory,
    map,
    references: references.references,
    pins: pins.pins,
    groupSize,
  });
  const written = [];
  for (const [index, assignment] of assignments.entries()) {
    const sequence = formatSequence(index);
    const file = path.join(out, `assignment-${sequence}.json`);
    await writeJson(file, assignment);
    written.push({
      path: file,
      bins: path.join(out, `bins-${sequence}.json`),
      clusters: assignment.clusters.length,
      events: assignment.clusters.reduce((sum, cluster) => sum + cluster.events.length, 0),
    });
  }
  return { ok: true, out, assignments: written };
}

/** Pins every source directory and writes the pins and the skipped sources. */
async function runPin(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const sources = flags.get('source') ?? [];
  if (sources.length === 0) throw new CommandError('invalid-args', '--source <dir> is required');
  const out = resolveFlag(flags, 'out', context);
  const result = await pinSources(
    sources.map((source) => path.resolve(context.cwd, source)),
    context.git ?? realGit,
  );
  await writeJson(out, result);
  return { ok: true, out, pins: result.pins.map((pin) => `${pin.repo}@${pin.sha}`), skipped: result.skipped };
}

/** Writes the references file for the store. */
async function runReferences(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const out = resolveFlag(flags, 'out', context);
  const resolved = await resolveCaptureTarget({
    explicitName: readOptional(flags, 'store') ?? null,
    ...(context.home !== undefined && { home: context.home }),
  });
  if (!resolved.ok) throw resolutionFailure(resolved);
  const references = await buildReferences({ storePath: resolved.store.path });
  await writeJson(out, { store: resolved.store.name, references });
  return { ok: true, out, store: resolved.store.name, references: references.length };
}

/** Writes the artifact body for a record. */
async function runRender(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const record = await readJsonPath(resolveFlag(flags, 'file', context), RecordSchema);
  const out = resolveFlag(flags, 'out', context);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, renderArtifact(record), 'utf8');
  return { ok: true, out };
}

/** Checks every bins file against its assignment, then writes the curation record and reports its counts. */
async function runValidate(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const dir = resolveFlag(flags, 'assignments', context);
  const out = resolveFlag(flags, 'out', context);
  const names = (await readdir(dir)).filter((name) => /^assignment-\d+\.json$/.test(name)).toSorted();
  if (names.length === 0) throw new CommandError('file-not-found', `${dir} does not contain any assignment file`);

  const git = context.git ?? realGit;
  const judged: JudgedAssignment[] = [];
  const violations: BinViolation[] = [];
  for (const name of names) {
    const assignment = await readJsonPath(path.join(dir, name), AssignmentSchema);
    const file = path.join(dir, name.replace(/^assignment-/, 'bins-'));
    let bins;
    try {
      bins = await readJsonPath(file, BinsFileSchema);
    } catch (error) {
      violations.push({ file, event: null, message: describeError(error) });
      continue;
    }
    const entry = { assignment, bins, file };
    violations.push(...checkBins(entry, (root, sha, relative) => git.readFileAt(root, sha, relative)));
    judged.push(entry);
  }
  if (violations.length > 0) {
    throw new BinsError(
      `the bins break ${violations.length} ${violations.length === 1 ? 'rule' : 'rules'}`,
      violations,
    );
  }

  const record = buildRecord(judged);
  await writeJson(out, record);
  return { ok: true, out, counts: formatCounts(record), marks: record.marks.addressedBy.length };
}

// region | Helpers

/** Parsed flags: each flag's values, in order. */
type ParsedFlags = ReadonlyMap<FlagName, string[]>;

/** Scans the command's flags, refusing a positional argument and a repeated flag that may not repeat. */
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
  const flags = new Map<FlagName, string[]>();
  for (const flag of scanned.flags) {
    const values = flags.get(flag.name) ?? [];
    if (values.length > 0 && !REPEATABLE.has(flag.name)) {
      throw new CommandError('invalid-args', `--${flag.name} may be given once`);
    }
    values.push(flag.value ?? '');
    flags.set(flag.name, values);
  }
  return flags;
}

/** Returns a single-valued flag's value, or `undefined` when it is absent. */
function readOptional(flags: ParsedFlags, flag: FlagName): string | undefined {
  return flags.get(flag)?.[0];
}

/** Returns a flag's value as a positive integer, or `undefined` when the flag is absent. */
function readPositiveInteger(flags: ParsedFlags, flag: FlagName): number | undefined {
  const value = readOptional(flags, flag);
  if (value === undefined) return undefined;
  const number = Number(value);
  if (value === '' || !Number.isSafeInteger(number) || number < 1) {
    throw new CommandError('invalid-args', `--${flag} must be a positive integer (got "${value}")`);
  }
  return number;
}

/** Resolves a required path flag against the working directory, throwing `invalid-args` when it is absent. */
function resolveFlag(flags: ParsedFlags, flag: FlagName, context: CommandContext): string {
  const value = readOptional(flags, flag);
  if (value === undefined || value === '') throw new CommandError('invalid-args', `--${flag} <value> is required`);
  return path.resolve(context.cwd, value);
}

// endregion | Helpers
