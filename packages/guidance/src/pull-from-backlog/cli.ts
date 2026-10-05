/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard. */
/* eslint unicorn/no-process-exit: off -- same as above. */
/**
 * CLI entry for recommending the next ticket.
 *
 * Two commands, each printing one JSON result: `survey` reads the backlog, the milestones, the in-progress signals,
 * and groom-backlog's ledger, and reports the picture, the warnings, and the ranked candidates; `record` appends one
 * `pull` record to the ledger. `record` is the only writer, and the helper does not write anything remote.
 */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { readProjectPreferences } from '../derive-session-context/read-preferences.ts';
import {
  fetchClosedIssuesSince,
  fetchMilestones,
  fetchOpenIssues,
  resolveRepository,
  resolveShortSha,
  runCommand,
} from '../groom-backlog/fetch.ts';
import { detectInProgress } from '../groom-backlog/in-progress.ts';
import { appendRecords, readLedger, resolveLedgerPaths } from '../groom-backlog/ledger.ts';
import { readRippleLedgerState, selectPendingRipples } from '../groom-backlog/ripple-baseline.ts';
import type { LedgerRecord } from '../groom-backlog/schemas.ts';
import type { CommandRunner } from '../groom-backlog/types.ts';
import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { isRecord } from '../lib/type-guards.ts';
import { type PullConfig, PullConfigSchema } from './schemas.ts';
import { buildSurvey, type PendingRipples } from './survey.ts';

/** Everything a command reads from its environment, injected so that tests can supply fixtures. */
export interface CommandContext {
  now: Date;
  root: string;
  run: CommandRunner;
}

/** A command's result: a success payload, or a structured failure that the helper reports at exit 0. */
export type CommandResult = { ok: false; error: string; message: string } | ({ ok: true } & Record<string, unknown>);

type FlagName = 'limit' | 'now' | 'ticket';

const FLAG_SPECS: ReadonlyArray<FlagSpec<FlagName>> = [
  { name: 'limit', takesValue: true },
  { name: 'now', takesValue: true },
  { name: 'ticket', takesValue: true },
];

/** The candidates that `survey` reports without `--limit`. */
const DEFAULT_LIMIT = 3;

/** The prefix of a `pull` record's run id, `pull-{YYYY-MM-DD}`. */
const PULL_RUN_PREFIX = 'pull-';

/** A failure that a command reports as a structured result rather than throwing to `main`. */
class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runCli(process.argv.slice(2), { now: new Date(), root: process.cwd(), run: runCommand });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`pull-from-backlog: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Runs one command. Invalid arguments, an invalid `ticket.pull` section, and a failed `gh` or `git` call become
 * structured `{ ok: false }` results.
 */
export async function runCli(argv: readonly string[], context: CommandContext): Promise<CommandResult> {
  const [command, ...rest] = argv;
  try {
    const flags = parseFlags(rest);
    switch (command) {
      case 'record':
        return await runRecord(flags, context);
      case 'survey':
        return await runSurvey(flags, context);
      default:
        throw new CommandError('invalid-args', `expected a command (record, survey), got "${command ?? ''}"`);
    }
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, error: error.code, message: error.message };
    return { ok: false, error: 'command-failed', message: describeError(error) };
  }
}

/** Appends one `pull` record naming the `--ticket` tickets and the current commit. */
async function runRecord(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  refuseFlags(flags, 'record', ['limit', 'now']);
  const picked = (flags.get('ticket') ?? []).map((value) => parsePositiveInteger('ticket', value));
  if (picked.length === 0) throw new CommandError('invalid-args', '--ticket is required');

  const recordedAt = toSeconds(context.now);
  const record: LedgerRecord = {
    run: `${PULL_RUN_PREFIX}${recordedAt.slice(0, 10)}`,
    kind: 'pull',
    picked,
    sha: await resolveShortSha(context.run, context.root),
    recordedAt,
  };
  const paths = await resolveLedgerPaths(context.run, context.root);
  appendRecords(paths.ledgerFile, [record]);
  return { ok: true, record, ledger: paths.ledgerFile };
}

/** Reports the picture, the warnings, and the top `--limit` candidates without writing anything. */
async function runSurvey(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  refuseFlags(flags, 'survey', ['ticket']);
  const limitValue = readOptional(flags, 'limit');
  const limit = limitValue === undefined ? DEFAULT_LIMIT : parsePositiveInteger('limit', limitValue);
  const nowFlag = readOptional(flags, 'now');
  if (nowFlag === '') throw new CommandError('invalid-args', '--now must name a milestone');
  const config = await readPullConfig(context.root);

  const paths = await resolveLedgerPaths(context.run, context.root);
  const ledger = readLedger(paths.ledgerFile);
  const repository = await resolveRepository(context.run, context.root);
  const open = await fetchOpenIssues(context.run, context.root);
  const milestones = await fetchMilestones(context.run, context.root);
  const user = (await context.run('gh', ['api', 'user', '--jq', '.login'], context.root)).trim();
  const inProgress = await detectInProgress({
    defaultBranch: repository.defaultBranch,
    numbers: new Set(open.map((issue) => issue.number)),
    root: context.root,
    run: context.run,
  });
  const pendingRipples = await listPendingRipples(context, ledger.records);

  const survey = buildSurvey({
    config,
    inProgress,
    limit,
    milestones,
    now: context.now,
    nowFlag,
    open,
    pendingRipples,
    records: ledger.records,
    user,
  });
  return {
    ok: true,
    ...survey,
    assignOnPick: config.assignOnPick,
    ledger: paths.ledgerFile,
    ledgerDefects: ledger.defects,
  };
}

// region | Helpers

/** Parsed flags: each flag's values in order. */
type ParsedFlags = ReadonlyMap<FlagName, string[]>;

/** Returns whether this module is the process's entry point. */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    process.stderr.write(`pull-from-backlog: warning: could not determine entry point: ${describeError(error)}\n`);
    return false;
  }
}

/**
 * Lists the tickets closed since the latest `pull` record, else the latest groom `policy` record, that lack a `ripple`
 * record. Without either baseline, the result states the reason instead.
 */
async function listPendingRipples(context: CommandContext, records: readonly LedgerRecord[]): Promise<PendingRipples> {
  const { lastPolicy, lastPull, rippled } = readRippleLedgerState(records);
  const baseline = lastPull === undefined ? 'policy' : 'pull';
  const since = lastPull ?? lastPolicy;
  if (since === undefined) {
    return { baseline: null, reason: 'the ledger does not have a pull or groom policy record' };
  }
  const closed = await fetchClosedIssuesSince(context.run, context.root, since.slice(0, 10));
  return { baseline, pending: selectPendingRipples(closed, since, rippled), since };
}

/** Scans the command's flags, refusing a positional argument and a repeated flag other than `--ticket`. */
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
    if (values.length > 0 && flag.name !== 'ticket') {
      throw new CommandError('invalid-args', `--${flag.name} may be given once`);
    }
    flags.set(flag.name, [...values, flag.value ?? '']);
  }
  return flags;
}

/** Parses `value` as a positive integer for `--name`, throwing `invalid-args` otherwise. */
function parsePositiveInteger(name: FlagName, value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CommandError('invalid-args', `--${name} must be a positive integer, got "${value}"`);
  }
  return parsed;
}

/** Returns the single value of `name`, or `undefined` when it is absent. */
function readOptional(flags: ParsedFlags, name: FlagName): string | undefined {
  return flags.get(name)?.[0];
}

/** Reads `ticket.pull` from the project's preferences with each default filled in, throwing `invalid-config`. */
async function readPullConfig(root: string): Promise<PullConfig> {
  const preferences = await readProjectPreferences(root);
  const section = isRecord(preferences.ticket) ? preferences.ticket.pull : undefined;
  const parsed = PullConfigSchema.safeParse(section ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `ticket.pull.${issue.path.join('.')}: ${issue.message}`);
    throw new CommandError('invalid-config', issues.join('; '));
  }
  return parsed.data;
}

/** Throws `invalid-args` when `flags` contains any of `refused`, which `command` does not take. */
function refuseFlags(flags: ParsedFlags, command: string, refused: readonly FlagName[]): void {
  const found = refused.find((name) => flags.has(name));
  if (found !== undefined) throw new CommandError('invalid-args', `${command} does not take --${found}`);
}

/** Formats `date` as an ISO timestamp without milliseconds, as groom-backlog's records are. */
function toSeconds(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

// endregion | Helpers
