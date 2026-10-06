/** The warnings that a survey reports, and the staleness of the last groom. */
import type { Milestone } from '../groom-backlog/fetch.ts';
import { isGroomPolicy } from '../groom-backlog/groom-policy.ts';
import type { LedgerRecord } from '../groom-backlog/schemas.ts';
import type { Issue } from '../groom-backlog/types.ts';
import { daysSince } from './days.ts';

/** Why the last groom counts as stale. */
export type GroomStaleReason = 'age' | 'never' | 'new-tickets';

/** The last groom's age and the open tickets created since it, against the staleness thresholds. */
export interface GroomStaleness {
  daysSince: number | null;
  lastGroomAt: string | null;
  newTickets: number | null;
  reasons: GroomStaleReason[];
  stale: boolean;
}

/** An in-progress ticket as the survey reports it. */
export interface InProgressEntry {
  assignees: string[];
  daysSinceLastCommit: number | null;
  lastCommitAt: string | null;
  number: number;
  ref: string | null;
  title: string;
}

/** One warning that the skill presents with the picture. */
export type Warning =
  | { blockers: number[]; kind: 'blocked-outside-now'; number: number }
  | { days: number; kind: 'milestone-past-due'; title: string }
  | { days: number; kind: 'stale-branch'; number: number; ref: string }
  | { kind: 'groom-stale'; reasons: GroomStaleReason[] }
  | { kind: 'now-not-found'; title: string };

/**
 * Assesses the last groom: stale when no groom has run, when it is at least `staleGroomDays` old, or when at least
 * `staleGroomNewTickets` open tickets were created since it. A ripple or a dry run is not a groom.
 */
export function assessGroomStaleness(input: {
  now: Date;
  open: readonly Issue[];
  records: readonly LedgerRecord[];
  staleGroomDays: number;
  staleGroomNewTickets: number;
}): GroomStaleness {
  const { now, open, records, staleGroomDays, staleGroomNewTickets } = input;
  const lastGroomAt = records.findLast(isGroomPolicy)?.recordedAt;
  if (lastGroomAt === undefined) {
    return { daysSince: null, lastGroomAt: null, newTickets: null, reasons: ['never'], stale: true };
  }
  const age = daysSince(lastGroomAt, now);
  const newTickets = open.filter((issue) => Date.parse(issue.createdAt) > Date.parse(lastGroomAt)).length;
  const reasons: GroomStaleReason[] = [];
  if (age >= staleGroomDays) reasons.push('age');
  if (newTickets >= staleGroomNewTickets) reasons.push('new-tickets');
  return { daysSince: age, lastGroomAt, newTickets, reasons, stale: reasons.length > 0 };
}

/**
 * Collects the warnings, in this order: a configured Now milestone that is not open, each open milestone past due,
 * each in-progress ticket whose last commit is at least `staleBranchDays` old, each Now ticket blocked by an open
 * ticket outside Now, and a stale groom.
 */
export function collectWarnings(input: {
  groom: GroomStaleness;
  inNow: (issue: Issue) => boolean;
  inProgress: readonly InProgressEntry[];
  milestones: readonly Milestone[];
  notFound: string | null;
  now: Date;
  open: readonly Issue[];
  staleBranchDays: number;
}): Warning[] {
  const { groom, inNow, inProgress, milestones, notFound, now, open, staleBranchDays } = input;
  const warnings: Warning[] = [];
  if (notFound !== null) warnings.push({ kind: 'now-not-found', title: notFound });

  for (const milestone of milestones) {
    if (milestone.state !== 'open' || milestone.dueOn === null) continue;
    const days = daysSince(milestone.dueOn, now);
    if (days > 0) warnings.push({ days, kind: 'milestone-past-due', title: milestone.title });
  }

  for (const entry of inProgress) {
    if (entry.ref === null || entry.daysSinceLastCommit === null) continue;
    if (entry.daysSinceLastCommit >= staleBranchDays) {
      warnings.push({ days: entry.daysSinceLastCommit, kind: 'stale-branch', number: entry.number, ref: entry.ref });
    }
  }

  const byNumber = new Map(open.map((issue) => [issue.number, issue]));
  for (const issue of open) {
    if (!inNow(issue)) continue;
    const blockers = issue.blockedBy.filter((blocker) => {
      const blocking = byNumber.get(blocker);
      return blocking !== undefined && !inNow(blocking);
    });
    if (blockers.length > 0) warnings.push({ blockers, kind: 'blocked-outside-now', number: issue.number });
  }

  if (groom.stale) warnings.push({ kind: 'groom-stale', reasons: groom.reasons });
  return warnings;
}
