/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard. */
/* eslint unicorn/no-process-exit: off -- same as above. */
/**
 * CLI entry for the backlog sweep.
 *
 * Seven commands, each printing one JSON result: `collect` selects the open tickets, from the backlog or related to a
 * closed ticket, and writes one assessor input file per ticket; `ingest` validates and classifies one assessor reply;
 * `record` appends the skill's decision, policy, note, ripple, and pull records; `digest` renders the run's open
 * escalations; `comment` renders one ticket's comment body to a file; `related` lists a closed ticket's related set;
 * `pending-ripples` lists the closed tickets without a ripple record. `ingest` and `record` are the only writers of the
 * ledger.
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
import {
  fetchClosedIssuesSince,
  fetchIssue,
  fetchOpenIssues,
  fetchPullRequest,
  type RepositoryInfo,
  resolveRepository,
  resolveShortSha,
  runCommand,
} from './fetch.ts';
import { detectInProgress } from './in-progress.ts';
import { appendRecords, buildReplyPath, type LedgerPaths, readLedger, resolveLedgerPaths } from './ledger.ts';
import { findLatestMarker, findLatestRunMarkerDate } from './marker.ts';
import { countByTier, findRelated, type RelatedCandidate } from './related.ts';
import {
  type AssessmentRecord,
  AssessorReplySchema,
  DECIDED_BY,
  DECISIONS,
  InProgressSchema,
  type LedgerRecord,
  RecordInputSchema,
} from './schemas.ts';
import { applySelectors, groupByScope, groupInOrder, orderForSweep, parseAge } from './select.ts';
import type { CommandRunner, Escalation, Issue, RippleEvidence, TicketGroup, TicketInput } from './types.ts';

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
  | 'related-to'
  | 'run'
  | 'scope'
  | 'since'
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
  { name: 'related-to', takesValue: true },
  { name: 'run', takesValue: true },
  { name: 'scope', takesValue: true },
  { name: 'since', takesValue: true },
  { name: 'superseded-by', takesValue: true },
  { name: 'ticket', takesValue: true },
];

/** The most touched paths that a ripple ticket file lists. */
const RIPPLE_FILE_LIMIT = 200;

/** The prefix of a ripple's run id, `ripple-{N}`. */
const RIPPLE_RUN_PREFIX = 'ripple-';

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
      case 'pending-ripples':
        return await runPendingRipples(flags, context);
      case 'record':
        return await runRecord(flags, context);
      case 'related':
        return await runRelated(flags, context);
      default:
        throw new CommandError(
          'invalid-args',
          `expected a command (collect, comment, digest, ingest, pending-ripples, record, related), got "${command ?? ''}"`,
        );
    }
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, error: error.code, message: error.message };
    return { ok: false, error: 'command-failed', message: describeError(error) };
  }
}

/**
 * Selects the tickets to assess and writes one input file per ticket under `--out`: the backlog narrowed by the
 * selectors, or, with `--related-to`, the open tickets related to that closed ticket, each file with a `ripple` field
 * and the result with the `ripple` record that the skill appends once the set is assessed.
 * A ticket already assessed in this run is skipped unless it changed after both that assessment and the latest comment
 * carrying this run's marker, so that the sweep's own comment does not make a ticket look changed. A skipped ticket
 * whose latest assessment has an auto-close class and no decision after it is reported in `pendingAutomatic`, so that
 * the skill still applies it.
 */
async function runCollect(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const run = readRequired(flags, 'run');
  const outDir = path.resolve(context.root, readRequired(flags, 'out'));
  const relatedTo = readOptional(flags, 'related-to');

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
  const selection =
    relatedTo === undefined
      ? await selectBacklog(flags, context)
      : await selectRipple(flags, context, repository, parsePositiveInteger('related-to', relatedTo));

  const resumed: number[] = [];
  const pending = selection.ordered.filter((issue) => {
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
  const issues = selection.limit === undefined ? pending : pending.slice(0, selection.limit);

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
    const ripple = selection.ripple?.evidence(issue.number);
    const input: TicketInput = {
      ...issue,
      crossReferences: crossReferences.get(issue.number) ?? [],
      inProgress: inProgress.get(issue.number) ?? null,
      priorMarker: findLatestMarker(issue.comments),
      ...(ripple !== undefined && { ripple }),
    };
    const file = path.join(outDir, `${issue.number}.json`);
    writeFileSync(file, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
    tickets.push({ file, number: issue.number });
  }

  const groups: TicketGroup[] =
    selection.ripple === undefined ? groupByScope(issues, inProgress) : groupInOrder(issues, inProgress);
  return {
    ok: true,
    run,
    sha,
    ledger: paths.ledgerFile,
    ledgerDefects: ledger.defects,
    counts: {
      fetched: selection.fetched,
      selected: selection.ordered.length,
      resumed: resumed.length,
      total: issues.length,
    },
    resumed,
    pendingAutomatic,
    groups,
    tickets,
    ...(selection.ripple !== undefined && { ripple: selection.ripple.record }),
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
 * Lists the closed tickets that do not have a `ripple` record in the ledger: `--ticket` alone, or every ticket closed
 * since `--since`. Without either, the baseline is the latest `pull` record, else the latest `policy` record of a run
 * that is not a ripple; without a baseline, the result is `no-baseline`.
 */
async function runPendingRipples(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const ticket = readOptional(flags, 'ticket');
  const sinceFlag = readOptional(flags, 'since');
  if (ticket !== undefined && sinceFlag !== undefined) {
    throw new CommandError('invalid-args', '--ticket and --since may not be combined');
  }
  if (sinceFlag !== undefined && Number.isNaN(Date.parse(sinceFlag))) {
    throw new CommandError('invalid-args', `--since must be an ISO date or timestamp, got "${sinceFlag}"`);
  }

  const paths = await resolveLedgerPaths(context.run, context.root);
  const ledger = readLedger(paths.ledgerFile);
  const rippled = new Set<number>();
  let lastPull: string | undefined;
  let lastPolicy: string | undefined;
  for (const record of ledger.records) {
    if (record.kind === 'ripple') rippled.add(record.number);
    else if (record.kind === 'pull') lastPull = record.recordedAt;
    else if (record.kind === 'policy' && !record.run.startsWith(RIPPLE_RUN_PREFIX)) lastPolicy = record.recordedAt;
  }

  if (ticket !== undefined) {
    const issue = await fetchIssue(context.run, context.root, parsePositiveInteger('ticket', ticket));
    const pending = issue.state === 'closed' && !rippled.has(issue.number) ? [summarizePending(issue)] : [];
    return { ok: true, since: null, baseline: null, pending, ledgerDefects: ledger.defects };
  }

  const candidates = [
    { baseline: 'since', since: sinceFlag },
    { baseline: 'pull', since: lastPull },
    { baseline: 'policy', since: lastPolicy },
  ] as const;
  const chosen = candidates.find((candidate) => candidate.since !== undefined);
  const since = chosen?.since;
  if (chosen === undefined || since === undefined) {
    throw new CommandError(
      'no-baseline',
      'the ledger does not have a pull or groom policy record; pass --ticket or --since',
    );
  }
  const { baseline } = chosen;
  const closed = await fetchClosedIssuesSince(context.run, context.root, since.slice(0, 10));
  const pending = closed
    .filter(
      (issue) =>
        issue.closedAt !== null && Date.parse(issue.closedAt) >= Date.parse(since) && !rippled.has(issue.number),
    )
    .toSorted((a, b) => a.number - b.number)
    .map(summarizePending);
  return { ok: true, since, baseline, pending, ledgerDefects: ledger.defects };
}

/**
 * Appends `decision`, `policy`, `note`, `ripple`, and `pull` records read from stdin as one JSON object, a JSON array,
 * or JSON lines.
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

/** Lists the open tickets related to the closed `--ticket`, with the counts by tier, without writing anything. */
async function runRelated(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const number = parsePositiveInteger('ticket', readRequired(flags, 'ticket'));
  const repository = await resolveRepository(context.run, context.root);
  const ripple = await resolveRipple(context, repository, number);
  return {
    ok: true,
    ticket: number,
    title: ripple.closed.title,
    pr: ripple.pr,
    mergeSha: ripple.mergeSha,
    files: ripple.files.length,
    counts: { ...countByTier(ripple.candidates), total: ripple.candidates.length },
    candidates: ripple.candidates,
  };
}

// region | Helpers

/** A closed ticket's related set and the merge that closed it. */
interface RippleSet {
  candidates: RelatedCandidate[];
  closed: Issue;
  files: string[];
  mergeSha: string | null;
  open: Issue[];
  pr: number | null;
}

/** The tickets that `collect` assesses, in assessment order, before the resume rule and the cap. */
interface Selection {
  fetched: number;
  limit: number | undefined;
  ordered: Issue[];
  /** The ripple's record and each ticket's evidence; absent outside a ripple. */
  ripple?: {
    evidence: (number: number) => RippleEvidence | undefined;
    record: { candidates: number[]; kind: 'ripple'; number: number; pr: number | null };
  };
}

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

/**
 * Fetches the closed ticket `number`, finds its latest closing PR and the files that the PR touched, and computes the
 * open tickets related to it. A ticket that is still open is `invalid-args`.
 */
async function resolveRipple(context: CommandContext, repository: RepositoryInfo, number: number): Promise<RippleSet> {
  const closed = await fetchIssue(context.run, context.root, number);
  if (closed.state === 'open') {
    throw new CommandError('invalid-args', `#${number} is open; a ripple follows a closed ticket`);
  }
  const references = await findCrossReferences({
    defaultBranch: await resolveLogRef(context.run, context.root, repository.defaultBranch),
    issues: [closed],
    nameWithOwner: repository.nameWithOwner,
    root: context.root,
    run: context.run,
  });
  const closingRef = references.get(number)?.findLast((reference) => reference.kind === 'closing-pr');
  const pr = closingRef === undefined ? null : Number(closingRef.ref.slice(1));
  const detail = pr === null ? undefined : await fetchPullRequest(context.run, context.root, pr);
  const files = detail?.files ?? [];
  const open = await fetchOpenIssues(context.run, context.root);
  return {
    candidates: findRelated({ closed, closingPr: pr, files, open }),
    closed,
    files,
    mergeSha: detail?.mergeSha?.slice(0, 8) ?? null,
    open,
    pr,
  };
}

/** Selects the backlog by `--scope`, `--exclude-label`, and `--older-than`, in sweep order, capped by `--limit`. */
async function selectBacklog(flags: ParsedFlags, context: CommandContext): Promise<Selection> {
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
  const fetched = await fetchOpenIssues(context.run, context.root);
  return {
    fetched: fetched.length,
    limit: selectors.limit,
    ordered: orderForSweep(applySelectors(fetched, selectors, context.now)),
  };
}

/** Selects the open tickets related to the closed ticket `number`, in tier order; every backlog selector is refused. */
async function selectRipple(
  flags: ParsedFlags,
  context: CommandContext,
  repository: RepositoryInfo,
  number: number,
): Promise<Selection> {
  const refused = (['scope', 'exclude-label', 'older-than', 'limit'] as const).find((name) => flags.has(name));
  if (refused !== undefined) {
    throw new CommandError('invalid-args', `--related-to may not be combined with --${refused}`);
  }
  const ripple = await resolveRipple(context, repository, number);
  const byNumber = new Map(ripple.open.map((issue) => [issue.number, issue]));
  const tiers = new Map(ripple.candidates.map((candidate) => [candidate.number, candidate.tiers]));
  const evidence = {
    closedNumber: ripple.closed.number,
    closedTitle: ripple.closed.title,
    files: ripple.files.slice(0, RIPPLE_FILE_LIMIT),
    filesTruncated: ripple.files.length > RIPPLE_FILE_LIMIT,
    mergeSha: ripple.mergeSha,
    pr: ripple.pr,
  };
  return {
    fetched: ripple.open.length,
    limit: undefined,
    ordered: ripple.candidates.flatMap((candidate) => byNumber.get(candidate.number) ?? []),
    ripple: {
      evidence: (ticket) => {
        const matched = tiers.get(ticket);
        return matched === undefined ? undefined : { ...evidence, tiers: matched };
      },
      record: {
        candidates: ripple.candidates.map((candidate) => candidate.number),
        kind: 'ripple',
        number: ripple.closed.number,
        pr: ripple.pr,
      },
    },
  };
}

/** Returns the fields by which `pending-ripples` lists a closed ticket. */
function summarizePending(issue: Issue): { closedAt: string | null; number: number; title: string } {
  return { closedAt: issue.closedAt, number: issue.number, title: issue.title };
}

/** Formats `date` as an ISO timestamp without milliseconds, as the calibration's records are. */
function toSeconds(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

// endregion | Helpers
