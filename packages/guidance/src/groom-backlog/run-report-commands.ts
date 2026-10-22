import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { replaceSections } from '../lib/markdown-sections.ts';
import { type CommandContext, CommandError, type CommandResult } from './command.ts';
import { type CommentDecision, renderComment, shouldPostComment, type StoredReply } from './comment.ts';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_RANGE, renderDigest } from './digest.ts';
import { fetchIssue } from './fetch.ts';
import { buildReplyPath, type LedgerPaths, readLedger, resolveLedgerPaths } from './ledger.ts';
import { findLatestRunMarkerDate } from './marker.ts';
import { readParentStatus } from './parent-status.ts';
import { isOneOf, type ParsedFlags, parsePositiveInteger, readOptional, readRequired } from './parse-flags.ts';
import { type AssessmentRecord, AssessorReplySchema, DECIDED_BY, DECISIONS, InProgressSchema } from './schemas.ts';
import type { Escalation } from './types.ts';

/**
 * Renders one ticket's comment body to `--out`, and reports whether to post it; a comment that is not posted is not
 * rendered. A bulk decision does not need a reply; every other decision does.
 */
export async function runComment(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
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
  const childrenValue = readOptional(flags, 'children');
  if (decision === 'split' && childrenValue === undefined) {
    throw new CommandError('invalid-args', '--children is required for a split');
  }
  const children = childrenValue?.split(',').map((child) => parsePositiveInteger('children', child.trim()));

  const paths = await resolveLedgerPaths(context.git, context.root);
  const reply = decidedBy === 'bulk' ? undefined : readReply(paths, run, number);
  if (decidedBy !== 'bulk' && reply === undefined) {
    throw new CommandError('missing-reply', `run "${run}" does not have a valid reply file for #${number}`);
  }
  const commentDecision: CommentDecision = {
    children,
    decidedBy,
    decision,
    reason: readOptional(flags, 'reason'),
    run,
    supersededBy: supersededBy === undefined ? undefined : parsePositiveInteger('superseded-by', supersededBy),
  };
  if (!shouldPostComment(commentDecision, reply)) return { ok: true, number, post: false };
  const body = renderComment(commentDecision, reply);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, body, 'utf8');
  return { ok: true, number, post: true, out };
}

/**
 * Renders the run's open escalations: each ticket whose latest assessment in the run escalated and that does not have
 * a decision recorded after it.
 */
export async function runDigest(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const run = readRequired(flags, 'run');
  const pageSizeValue = readOptional(flags, 'page-size');
  const pageSize = pageSizeValue === undefined ? DEFAULT_PAGE_SIZE : parsePositiveInteger('page-size', pageSizeValue);
  if (pageSize < PAGE_SIZE_RANGE.min || pageSize > PAGE_SIZE_RANGE.max) {
    throw new CommandError(
      'invalid-args',
      `--page-size must be between ${PAGE_SIZE_RANGE.min} and ${PAGE_SIZE_RANGE.max}, got ${pageSize}`,
    );
  }

  const paths = await resolveLedgerPaths(context.git, context.root);
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

/**
 * Composes one ticket's drafted edit into files under `--out`: the new body, from the ticket's current body with the
 * drafted sections replaced, and one file per child of a split. The result names the drafted title, if any. The draft is
 * stale, and nothing is written, when the ticket changed after the version that the assessor read and after the latest
 * comment containing this run's marker. A ticket in progress keeps its problem, context, and proposed solution, so a
 * draft that replaces one is refused.
 */
export async function runDraft(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const run = readRequired(flags, 'run');
  const number = parsePositiveInteger('number', readRequired(flags, 'number'));
  const out = path.resolve(context.root, readRequired(flags, 'out'));

  const paths = await resolveLedgerPaths(context.git, context.root);
  const reply = readReply(paths, run, number);
  if (reply === undefined) {
    throw new CommandError('missing-reply', `run "${run}" does not have a valid reply file for #${number}`);
  }
  const { draft } = reply;
  if (draft === null) throw new CommandError('missing-draft', `the reply for #${number} does not have a draft`);
  const frozen = draft.sections.filter((section) => FROZEN_HEADINGS.has(section.heading.toLowerCase()));
  if (reply.inProgress !== null && frozen.length > 0) {
    const headings = frozen.map((section) => section.heading).join(', ');
    throw new CommandError('frozen-section', `#${number} is in progress, and the draft replaces ${headings}`);
  }

  const issue = await fetchIssue(context.run, context.root, number);
  const commented = findLatestRunMarkerDate(issue.comments, run);
  const updated = Date.parse(issue.updatedAt);
  const isStale =
    updated > Date.parse(reply.ticketUpdatedAt) && (commented === undefined || updated > Date.parse(commented));
  if (isStale) return { ok: true, number, stale: true };

  mkdirSync(out, { recursive: true });
  const body = path.join(out, 'body.md');
  writeFileSync(body, replaceSections({ text: issue.body, sections: draft.sections }), 'utf8');
  const children = draft.children.map((child, offset) => {
    const file = path.join(out, `child-${offset + 1}.md`);
    writeFileSync(file, `${child.body.trim()}\n`, 'utf8');
    return { title: child.title, path: file };
  });
  return {
    ok: true,
    number,
    stale: false,
    body,
    title: draft.title,
    sections: draft.sections.map((section) => section.heading),
    children,
  };
}

/** Reports whether the merged `--ticket` was the last open child of an open parent, without writing anything. */
export async function runParentStatus(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const ticket = parsePositiveInteger('ticket', readRequired(flags, 'ticket'));
  const status = await readParentStatus(async (number) => fetchIssue(context.run, context.root, number), ticket);
  return { ok: true, ...status };
}

// region | Helpers

/** The sections of a ticket that are frozen once its work is under way, matched in lowercase. */
const FROZEN_HEADINGS: ReadonlySet<string> = new Set(['context', 'problem', 'proposed solution']);

/** Reads a reply file, or returns `undefined` when the run does not have one for the ticket. */
function readReply(paths: LedgerPaths, run: string, number: number): StoredReply | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(buildReplyPath(paths, run, number), 'utf8'));
    const reply = AssessorReplySchema.safeParse(parsed);
    const provenance = z
      .object({
        assessedAt: z.string(),
        inProgress: InProgressSchema.nullable().default(null),
        sha: z.string(),
        ticketUpdatedAt: z.string(),
        umbrella: z.boolean().default(false),
      })
      .safeParse(parsed);
    return reply.success && provenance.success ? { ...reply.data, ...provenance.data } : undefined;
  } catch {
    return undefined;
  }
}

// endregion | Helpers
