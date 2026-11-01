/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/**
 * CLI entry for the triage of feedback clusters.
 *
 * Two commands, each printing one JSON result: `validate` parses a triage record and checks the rules that span its
 * fields, and `render` writes the triage artifact's body from a record. The helper does not write to a store or a
 * tracker: The skill files tickets through `create-ticket` and marks events through `kb-update-events`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import {
  checkRules,
  findPending,
  orderClusters,
  RecordSchema,
  type RuleViolation,
  type TriageRecord,
} from './record-schema.ts';
import { renderArtifact } from './render.ts';

/** Everything a command reads from its environment, injected so that tests can supply fixtures. */
export interface CommandContext {
  cwd: string;
}

/** A command's result: a success payload, or a structured failure that the helper reports at exit 1. */
export type CommandResult =
  | { ok: false; error: string; message: string; violations?: RuleViolation[] }
  | ({ ok: true } & Record<string, unknown>);

const COMMANDS = ['render', 'validate'] as const;

type FlagName = 'file' | 'out';

const FLAG_SPECS: ReadonlyArray<FlagSpec<FlagName>> = [
  { name: 'file', takesValue: true },
  { name: 'out', takesValue: true },
];

/** A failure that a command reports as a structured result rather than throwing to `main`. */
class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly violations?: RuleViolation[],
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
    const result = await runCli(argv, { cwd: process.cwd() });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`triage-feedback: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, 'triage-feedback')) {
  await main();
}

/** Runs one command. Invalid arguments and a missing, malformed, or rule-breaking record become `{ ok: false }`. */
export async function runCli(argv: readonly string[], context: CommandContext): Promise<CommandResult> {
  const [command, ...rest] = argv;
  try {
    const flags = parseFlags(rest);
    switch (command) {
      case 'render':
        return await runRender(flags, context);
      case 'validate':
        return await runValidate(flags, context);
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
    'triage-feedback: validate a feedback triage record or render its artifact; prints a JSON result',
    '',
    'Usage:',
    '  triage-feedback validate --file <record.json>',
    '  triage-feedback render --file <record.json> --out <file>',
    '',
    'Commands:',
    '  validate   Check the record, then report its surfacing order and the clusters whose writes are pending',
    '  render     Write the triage artifact body: the surfaced clusters, the remainder, and the event ids',
    '',
    'Options:',
    '  --file <record.json>   The triage record',
    '  --out <file>           Where to write the artifact body',
    '  -h, --help             Print this help',
    '',
  ].join('\n');
}

/** Writes the artifact body for a valid record. */
async function runRender(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const record = await readRecord(flags, context);
  const out = path.resolve(context.cwd, readRequired(flags, 'out'));
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, renderArtifact(record), 'utf8');
  return { ok: true, out };
}

/** Validates the record and reports the counts, the surfacing order, and the pending writes. */
async function runValidate(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const record = await readRecord(flags, context);
  const ordered = orderClusters(record.clusters);
  return {
    ok: true,
    clusters: record.clusters.length,
    surfaced: ordered.filter((cluster) => cluster.surfaced).map((cluster) => cluster.id),
    pending: findPending(record),
  };
}

// region | Helpers

/** Parsed flags: each flag's value. */
type ParsedFlags = ReadonlyMap<FlagName, string>;

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

/** Reads the record at `--file`, throwing `record-not-found`, `invalid-record`, or `rule-violation`. */
async function readRecord(flags: ParsedFlags, context: CommandContext): Promise<TriageRecord> {
  const file = path.resolve(context.cwd, readRequired(flags, 'file'));
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    throw new CommandError('record-not-found', `could not read ${file}: ${describeError(error)}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new CommandError('invalid-record', `${file} is not JSON: ${describeError(error)}`);
  }
  const parsed = RecordSchema.safeParse(json);
  if (!parsed.success) {
    const violations = parsed.error.issues.map((issue) => ({
      cluster: null,
      message: `${issue.path.join('.')}: ${issue.message}`,
    }));
    throw new CommandError('invalid-record', `${file} does not match the record schema`, violations);
  }
  const violations = checkRules(parsed.data);
  if (violations.length > 0) {
    throw new CommandError(
      'rule-violation',
      `the record breaks ${violations.length} ${violations.length === 1 ? 'rule' : 'rules'}`,
      violations,
    );
  }
  return parsed.data;
}

/** Returns the value of a required flag, throwing `invalid-args` when it is absent or empty. */
function readRequired(flags: ParsedFlags, flag: FlagName): string {
  const value = flags.get(flag);
  if (value === undefined || value === '') throw new CommandError('invalid-args', `--${flag} <value> is required`);
  return value;
}

// endregion | Helpers
