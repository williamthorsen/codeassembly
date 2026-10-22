import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { z } from 'zod';

import { classify, isUmbrella } from './classify.ts';
import { type CommandContext, CommandError, type CommandResult } from './command.ts';
import { resolveShortSha } from './fetch.ts';
import { appendRecords, buildReplyPath, resolveLedgerPaths } from './ledger.ts';
import { type ParsedFlags, readRequired } from './parse-flags.ts';
import { AssessorReplySchema, InProgressSchema, type LedgerRecord, RecordInputSchema } from './schemas.ts';

/** Validates one assessor reply, stores it, appends its `assessment` record, and reports its class. */
export async function runIngest(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const run = readRequired(flags, 'run');
  const ticketFile = path.resolve(context.root, readRequired(flags, 'ticket'));
  const ticket = z
    .looseObject({
      number: z.number(),
      updatedAt: z.string(),
      inProgress: InProgressSchema.nullable(),
      body: z.string().default(''),
      subIssues: z.object({ completed: z.number(), total: z.number() }).default({ completed: 0, total: 0 }),
    })
    .parse(JSON.parse(readFileSync(ticketFile, 'utf8')));
  const inProgress = ticket.inProgress;
  const umbrella = isUmbrella(ticket);

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

  const policyClass = classify(reply, { inProgress, umbrella });
  const paths = await resolveLedgerPaths(context.git, context.root);
  const assessedAt = toSeconds(context.now);
  const sha = await resolveShortSha(context.git, context.root);

  const replyFile = buildReplyPath(paths, run, reply.number);
  mkdirSync(path.dirname(replyFile), { recursive: true });
  const stored = { ...reply, assessedAt, sha, ticketUpdatedAt: ticket.updatedAt, inProgress, umbrella };
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
 * Appends `decision`, `policy`, `note`, and `pull` records read from stdin as one JSON object, a JSON array, or JSON
 * lines.
 * Every record is validated before any is appended.
 */
export async function runRecord(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
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

  const paths = await resolveLedgerPaths(context.git, context.root);
  appendRecords(paths.ledgerFile, records);
  return { ok: true, appended: records.length, ledger: paths.ledgerFile };
}

// region | Helpers

/** Returns the JSON text of an assessor reply: its last fenced JSON block, or the whole reply when it has none. */
function extractReplyJson(reply: string): string {
  const blocks = reply.matchAll(/```(?:json)?\n([\s\S]*?)\n```/g).toArray();
  return blocks.at(-1)?.[1] ?? reply.trim();
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

/** Formats `date` as an ISO timestamp without milliseconds, as the calibration's records are. */
function toSeconds(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

// endregion | Helpers
