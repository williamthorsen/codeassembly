/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard. */
/* eslint unicorn/no-process-exit: off -- same as above. */
/**
 * CLI entry for the backlog sweep.
 *
 * Five commands, each printing one JSON result: `collect` selects the open tickets and writes one assessor input file
 * per ticket; `ingest` validates and classifies one assessor reply; `record` appends the skill's decision, policy, and
 * note records; `digest` renders the run's open escalations; `comment` renders one ticket's comment body to a file.
 * `ingest` and `record` are the only writers of the ledger.
 *
 * The helper does not write anything remote. The skill posts the comments and closes the tickets, which keeps this
 * module testable without a `gh` write.
 */
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { z } from 'zod';

import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { classify } from './classify.ts';
import { type CommentDecision, renderComment, type StoredReply } from './comment.ts';
import { findCrossReferences } from './cross-reference.ts';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_RANGE, renderDigest } from './digest.ts';
import { fetchOpenIssues, resolveRepository, resolveShortSha, runCommand } from './fetch.ts';
import { detectInProgress } from './in-progress.ts';
import { appendRecords, buildReplyPath, type LedgerPaths, readLedger, resolveLedgerPaths } from './ledger.ts';
import { findLatestMarker, findLatestRunMarkerDate } from './marker.ts';
import {
  type AssessmentRecord,
  AssessorReplySchema,
  DECIDED_BY,
  DECISIONS,
  InProgressSchema,
  type LedgerRecord,
  RecordInputSchema,
} from './schemas.ts';
import { applySelectors, groupByScope, orderForSweep, parseAge } from './select.ts';
import type { CommandRunner, Escalation, TicketGroup, TicketInput } from './types.ts';

/** Everything a command reads from its environment, injected so that tests can supply fixtures. */
export interface CommandContext {
  now: Date;
  root: string;
  run: CommandRunner;
  stdin: string;
}

/** A command's result: a success payload, or a structured failure that the helper reports at exit 0. */
export type CommandResult = { ok: false; error: string; message: string } | ({ ok: true } & Record<string, unknown>);

type FlagName =
  | 'decided-by'
  | 'decision'
  | 'exclude-label'
  | 'limit'
  | 'number'
  | 'older-than'
  | 'out'
  | 'page-size'
  | 'reason'
  | 'run'
  | 'scope'
  | 'superseded-by'
  | 'ticket';

const FLAG_SPECS: ReadonlyArray<FlagSpec<FlagName>> = [
  { name: 'decided-by', takesValue: true },
  { name: 'decision', takesValue: true },
  { name: 'exclude-label', takesValue: true },
  { name: 'limit', takesValue: true },
  { name: 'number', takesValue: true },
  { name: 'older-than', takesValue: true },
  { name: 'out', takesValue: true },
  { name: 'page-size', takesValue: true },
  { name: 'reason', takesValue: true },
  { name: 'run', takesValue: true },
  { name: 'scope', takesValue: true },
  { name: 'superseded-by', takesValue: true },
  { name: 'ticket', takesValue: true },
];

/** The flags that a command repeats; every other flag may appear once. */
const REPEATABLE: ReadonlySet<FlagName> = new Set(['exclude-label', 'scope']);

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
    const argv = process.argv.slice(2);
    const needsStdin = argv[0] === 'ingest' || argv[0] === 'record';
    const result = await runCli(argv, {
      now: new Date(),
      root: process.cwd(),
      run: runCommand,
      stdin: needsStdin ? await readStdin() : '',
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`groom-backlog: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Runs one command. Invalid arguments, an invalid reply or record, a missing reply file, and a failed `gh` or `git`
 * call become structured `{ ok: false }` results.
 */
export async function runCli(argv: readonly string[], context: CommandContext): Promise<CommandResult> {
  const [command, ...rest] = argv;
  try {
    const flags = parseFlags(rest);
    switch (command) {
      case 'collect':
        return await runCollect(flags, context);
      case 'comment':
        return await runComment(flags, context);
      case 'digest':
        return await runDigest(flags, context);
      case 'ingest':
        return await runIngest(flags, context);
      case 'record':
        return await runRecord(flags, context);
      default:
        throw new CommandError(
          'invalid-args',
          `expected a command (collect, comment, digest, ingest, record), got "${command ?? ''}"`,
        );
    }
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, error: error.code, message: error.message };
    return { ok: false, error: 'command-failed', message: describeError(error) };
  }
}

/**
 * Selects the tickets to assess and writes one input file per ticket under `--out`. A ticket already assessed in this
 * run is skipped unless it changed after both that assessment and the latest comment carrying this run's marker, so
 * that the sweep's own comment does not make a ticket look changed. A skipped ticket whose latest assessment has an
 * auto-close class and no decision after it is reported in `pendingAutomatic`, so that the skill still applies it.
 */
async function runCollect(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const run = readRequired(flags, 'run');
  const outDir = path.resolve(context.root, readRequired(flags, 'out'));
  const olderThan = readOptional(flags, 'older-than');
  const limit = readOptional(flags, 'limit');
  let olderThanDays: number | undefined;
  try {
    olderThanDays = olderThan === undefined ? undefined : parseAge(olderThan);
  } catch (error) {
    throw new CommandError('invalid-args', describeError(error));
  }
  const selectors = {
    excludeLabels: flags.get('exclude-label') ?? [],
    limit: limit === undefined ? undefined : parsePositiveInteger('limit', limit),
    olderThanDays,
    scopes: flags.get('scope') ?? [],
  };

  const paths = await resolveLedgerPaths(context.run, context.root);
  const ledger = readLedger(paths.ledgerFile);
  const assessedAt = new Map<number, string>();
  const undecidedClass = new Map<number, string | undefined>();
  for (const record of ledger.records) {
    if (record.run !== run) continue;
    if (record.kind === 'assessment') {
      assessedAt.set(record.number, record.assessedAt);
      undecidedClass.set(record.number, record.class);
    } else if (record.kind === 'decision') {
      undecidedClass.delete(record.number);
    }
  }

  const repository = await resolveRepository(context.run, context.root);
  const sha = await resolveShortSha(context.run, context.root);
  const fetched = await fetchOpenIssues(context.run, context.root);
  const selected = applySelectors(fetched, selectors, context.now);

  const resumed: number[] = [];
  const pending = selected.filter((issue) => {
    const assessed = assessedAt.get(issue.number);
    if (assessed === undefined) return true;
    const commented = findLatestRunMarkerDate(issue.comments, run);
    const updated = Date.parse(issue.updatedAt);
    const changed = updated > Date.parse(assessed) && (commented === undefined || updated > Date.parse(commented));
    if (!changed) resumed.push(issue.number);
    return changed;
  });
  const pendingAutomatic = resumed.flatMap((number) => {
    const policyClass = undecidedClass.get(number);
    return policyClass === 'auto-close-complete' || policyClass === 'auto-close-half-met'
      ? [{ number, class: policyClass }]
      : [];
  });
  const ordered = orderForSweep(pending);
  const issues = selectors.limit === undefined ? ordered : ordered.slice(0, selectors.limit);

  const numbers = new Set(issues.map((issue) => issue.number));
  const inProgress = await detectInProgress({
    defaultBranch: repository.defaultBranch,
    numbers,
    root: context.root,
    run: context.run,
  });
  const crossReferences = await findCrossReferences({
    defaultBranch: await resolveLogRef(context.run, context.root, repository.defaultBranch),
    issues,
    nameWithOwner: repository.nameWithOwner,
    root: context.root,
    run: context.run,
  });

  mkdirSync(outDir, { recursive: true });
  const tickets: Array<{ file: string; number: number }> = [];
  for (const issue of issues) {
    const input: TicketInput = {
      ...issue,
      crossReferences: crossReferences.get(issue.number) ?? [],
      inProgress: inProgress.get(issue.number) ?? null,
      priorMarker: findLatestMarker(issue.comments),
    };
    const file = path.join(outDir, `${issue.number}.json`);
    writeFileSync(file, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
    tickets.push({ file, number: issue.number });
  }

  const groups: TicketGroup[] = groupByScope(issues, inProgress);
  return {
    ok: true,
    run,
    sha,
    ledger: paths.ledgerFile,
    ledgerDefects: ledger.defects,
    counts: { fetched: fetched.length, selected: selected.length, resumed: resumed.length, total: issues.length },
    resumed,
    pendingAutomatic,
    groups,
    tickets,
  };
}

/** Renders one ticket's comment body to `--out`. A bulk decision needs no reply; every other decision does. */
async function runComment(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const run = readRequired(flags, 'run');
  const number = parsePositiveInteger('number', readRequired(flags, 'number'));
  const decision = readRequired(flags, 'decision');
  if (!isOneOf(DECISIONS, decision)) {
    throw new CommandError('invalid-args', `--decision must be one of ${DECISIONS.join(', ')}, got "${decision}"`);
  }
  const decidedBy = readRequired(flags, 'decided-by');
  if (!isOneOf(DECIDED_BY, decidedBy)) {
    throw new CommandError('invalid-args', `--decided-by must be one of ${DECIDED_BY.join(', ')}, got "${decidedBy}"`);
  }
  const out = path.resolve(context.root, readRequired(flags, 'out'));
  const supersededBy = readOptional(flags, 'superseded-by');

  const paths = await resolveLedgerPaths(context.run, context.root);
  const reply = decidedBy === 'bulk' ? undefined : readReply(paths, run, number);
  if (decidedBy !== 'bulk' && reply === undefined) {
    throw new CommandError('missing-reply', `run "${run}" does not have a valid reply file for #${number}`);
  }
  const commentDecision: CommentDecision = {
    decidedBy,
    decision,
    reason: readOptional(flags, 'reason'),
    run,
    supersededBy: supersededBy === undefined ? undefined : parsePositiveInteger('superseded-by', supersededBy),
  };
  const body = renderComment(commentDecision, reply);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, body, 'utf8');
  return { ok: true, number, out };
}

/**
 * Renders the run's open escalations: each ticket whose latest assessment in the run escalated and that does not have
 * a decision recorded after it.
 */
async function runDigest(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const run = readRequired(flags, 'run');
  const pageSizeValue = readOptional(flags, 'page-size');
  const pageSize = pageSizeValue === undefined ? DEFAULT_PAGE_SIZE : parsePositiveInteger('page-size', pageSizeValue);
  if (pageSize < PAGE_SIZE_RANGE.min || pageSize > PAGE_SIZE_RANGE.max) {
    throw new CommandError(
      'invalid-args',
      `--page-size must be between ${PAGE_SIZE_RANGE.min} and ${PAGE_SIZE_RANGE.max}, got ${pageSize}`,
    );
  }

  const paths = await resolveLedgerPaths(context.run, context.root);
  const ledger = readLedger(paths.ledgerFile);
  const latest = new Map<number, AssessmentRecord>();
  for (const record of ledger.records) {
    if (record.run !== run) continue;
    if (record.kind === 'assessment') latest.set(record.number, record);
    else if (record.kind === 'decision') latest.delete(record.number);
  }

  const titles = new Map<number, string>();
  const escalations: Escalation[] = [];
  for (const record of latest.values()) {
    const reply = readReply(paths, run, record.number);
    if (reply !== undefined) titles.set(record.number, reply.title);
    if (record.class === 'escalate' || record.class === 'escalate-in-progress') escalations.push({ record, reply });
  }
  const pages = renderDigest({ escalations, pageSize, titles });
  return { ok: true, run, total: escalations.length, pageSize, pages, ledgerDefects: ledger.defects };
}

/** Validates one assessor reply, stores it, appends its `assessment` record, and reports its class. */
async function runIngest(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const run = readRequired(flags, 'run');
  const ticketFile = path.resolve(context.root, readRequired(flags, 'ticket'));
  const ticket = z
    .looseObject({ number: z.number(), updatedAt: z.string(), inProgress: InProgressSchema.nullable() })
    .parse(JSON.parse(readFileSync(ticketFile, 'utf8')));
  const inProgress = ticket.inProgress;

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractReplyJson(context.stdin));
  } catch (error) {
    throw new CommandError('invalid-reply', `the reply is not JSON: ${describeError(error)}`);
  }
  const result = AssessorReplySchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new CommandError('invalid-reply', issues.join('; '));
  }
  const reply = result.data;
  if (reply.number !== ticket.number) {
    throw new CommandError('invalid-reply', `the reply assesses #${reply.number}, not #${ticket.number}`);
  }

  const policyClass = classify(reply, inProgress);
  const paths = await resolveLedgerPaths(context.run, context.root);
  const assessedAt = toSeconds(context.now);
  const sha = await resolveShortSha(context.run, context.root);

  const replyFile = buildReplyPath(paths, run, reply.number);
  mkdirSync(path.dirname(replyFile), { recursive: true });
  const stored = { ...reply, assessedAt, sha, ticketUpdatedAt: ticket.updatedAt, inProgress };
  writeFileSync(replyFile, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');

  const record: LedgerRecord = {
    run,
    kind: 'assessment',
    number: reply.number,
    assessedAt,
    sha,
    ticketUpdatedAt: ticket.updatedAt,
    verdicts: reply.verdicts,
    recommendation: reply.recommendation,
    confidence: reply.confidence,
    reason: reply.reason,
    relatedTickets: reply.relatedTickets,
    inProgress,
    class: policyClass,
    rule: reply.rule,
    dependsOn: reply.dependsOn,
    overlaps: reply.overlaps,
  };
  appendRecords(paths.ledgerFile, [record]);
  return { ok: true, number: reply.number, class: policyClass, recommendation: reply.recommendation, replyFile };
}

/**
 * Appends `decision`, `policy`, and `note` records read from stdin as one JSON object, a JSON array, or JSON lines.
 * Every record is validated before any is appended.
 */
async function runRecord(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const run = readRequired(flags, 'run');
  const timestamp = toSeconds(context.now);
  const inputs = parseRecordInputs(context.stdin);
  const records: LedgerRecord[] = inputs.map((input, index) => {
    const parsed = RecordInputSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
      throw new CommandError('invalid-record', `record ${index + 1}: ${issues.join('; ')}`);
    }
    const value = parsed.data;
    if (value.kind === 'decision') return { run, ...value, appliedAt: value.appliedAt ?? timestamp };
    return { run, ...value, recordedAt: value.recordedAt ?? timestamp };
  });

  const paths = await resolveLedgerPaths(context.run, context.root);
  appendRecords(paths.ledgerFile, records);
  return { ok: true, appended: records.length, ledger: paths.ledgerFile };
}

// region | Helpers

/** Returns the JSON text of an assessor reply: its last fenced JSON block, or the whole reply when it has none. */
function extractReplyJson(reply: string): string {
  const blocks = reply.matchAll(/```(?:json)?\n([\s\S]*?)\n```/g).toArray();
  return blocks.at(-1)?.[1] ?? reply.trim();
}

/** Returns whether this module is the process's entry point. */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    process.stderr.write(`groom-backlog: warning: could not determine entry point: ${describeError(error)}\n`);
    return false;
  }
}

/** Returns whether `value` is one of `options`. */
function isOneOf<T extends string>(options: readonly T[], value: string): value is T {
  return new Set<string>(options).has(value);
}

/** Parsed flags: each repeatable flag's values in order, and each other flag's single value. */
type ParsedFlags = ReadonlyMap<FlagName, string[]>;

/** Scans the command's flags, refusing a positional argument and a repeated single-valued flag. */
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

/** Parses stdin as one JSON object, a JSON array, or JSON lines, throwing `invalid-record` otherwise. */
function parseRecordInputs(stdin: string): unknown[] {
  const text = stdin.trim();
  if (text === '') throw new CommandError('invalid-record', 'stdin does not contain any record');
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    try {
      return text
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line): unknown => JSON.parse(line));
    } catch (error) {
      throw new CommandError('invalid-record', `stdin is not JSON or JSON lines: ${describeError(error)}`);
    }
  }
}

/** Returns the single value of `name`, or `undefined` when it is absent. */
function readOptional(flags: ParsedFlags, name: FlagName): string | undefined {
  return flags.get(name)?.[0];
}

/** Reads a reply file, or returns `undefined` when the run does not have one for the ticket. */
function readReply(paths: LedgerPaths, run: string, number: number): StoredReply | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(buildReplyPath(paths, run, number), 'utf8'));
    const reply = AssessorReplySchema.safeParse(parsed);
    const provenance = z.object({ assessedAt: z.string(), sha: z.string() }).safeParse(parsed);
    return reply.success && provenance.success ? { ...reply.data, ...provenance.data } : undefined;
  } catch {
    return undefined;
  }
}

/** Returns the single value of `name`, throwing `invalid-args` when it is absent. */
function readRequired(flags: ParsedFlags, name: FlagName): string {
  const value = readOptional(flags, name);
  if (value === undefined || value === '') throw new CommandError('invalid-args', `--${name} is required`);
  return value;
}

/** Reads all of stdin as UTF-8. */
async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  // The stream yields `any`, so each chunk is narrowed rather than asserted: A string arrives when an encoding is set.
  for await (const chunk of process.stdin) {
    chunks.push(chunk instanceof Uint8Array ? chunk : Buffer.from(String(chunk), 'utf8'));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Returns the ref whose log the cross-reference pass reads: the remote's default branch when it is fetched. */
async function resolveLogRef(run: CommandRunner, root: string, defaultBranch: string): Promise<string> {
  try {
    await run('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${defaultBranch}`], root);
    return `origin/${defaultBranch}`;
  } catch {
    return defaultBranch;
  }
}

/** Formats `date` as an ISO timestamp without milliseconds, as the calibration's records are. */
function toSeconds(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

// endregion | Helpers
