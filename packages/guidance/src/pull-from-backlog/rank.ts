/**
 * Filters the open tickets down to the candidates for the next pull and ranks them: a child of a partially-done
 * umbrella first, then by the open tickets that it blocks, then by priority label, then oldest first.
 */
import type { Issue } from '../groom-backlog/types.ts';
import { daysSince } from './days.ts';

/** The priority values in rank order; a label outside them ranks as unlabelled. */
const PRIORITIES: readonly string[] = ['high', 'medium', 'low'];

/** A ranked candidate with the reasons that placed it. */
export interface RankedCandidate {
  /** The open tickets whose `blockedBy` names this one. */
  blocking: number[];
  createdAt: string;
  number: number;
  /** The highest-ranked priority label, or `null` when the ticket does not have a recognized one. */
  priority: string | null;
  /** The ranking rules that fired, in rank order. */
  reasons: string[];
  title: string;
  /** The partially-done parent, or `null` when the ticket does not have one. */
  umbrella: { completed: number; number: number; total: number } | null;
  url: string;
}

/** Returns whether `issue` carries one of `excludeLabels`, compared trimmed and without regard to case. */
export function hasExcludedLabel(issue: Issue, excludeLabels: readonly string[]): boolean {
  const excluded = new Set(excludeLabels.map(normalizeLabel));
  return issue.labels.some((label) => excluded.has(normalizeLabel(label)));
}

/** Ranks `candidates` against the open tickets, best first. */
export function rankCandidates(input: {
  candidates: readonly Issue[];
  now: Date;
  open: readonly Issue[];
  priorityPrefix: string;
}): RankedCandidate[] {
  const { candidates, now, open, priorityPrefix } = input;
  const byNumber = new Map(open.map((issue) => [issue.number, issue]));
  const blocking = new Map<number, number[]>();
  for (const issue of open) {
    for (const blocker of issue.blockedBy) blocking.set(blocker, [...(blocking.get(blocker) ?? []), issue.number]);
  }

  const scored = candidates.map((issue) => {
    const parent = issue.parent === null ? undefined : byNumber.get(issue.parent);
    const umbrella = parent !== undefined && isPartiallyDone(parent) ? parent : undefined;
    const priority = findPriority(issue.labels, priorityPrefix);
    return {
      blocking: (blocking.get(issue.number) ?? []).toSorted((a, b) => a - b),
      issue,
      priority,
      priorityRank: priority === undefined ? PRIORITIES.length : priority.rank,
      umbrella,
    };
  });

  scored.sort(
    (a, b) =>
      compareUmbrellas(a.umbrella, b.umbrella) ||
      b.blocking.length - a.blocking.length ||
      a.priorityRank - b.priorityRank ||
      Date.parse(a.issue.createdAt) - Date.parse(b.issue.createdAt) ||
      a.issue.number - b.issue.number,
  );

  return scored.map(({ blocking: blocked, issue, priority, umbrella }) => {
    const reasons: string[] = [];
    if (umbrella !== undefined) {
      reasons.push(`continues #${umbrella.number} (${umbrella.subIssues.completed}/${umbrella.subIssues.total} done)`);
    }
    if (blocked.length > 0) reasons.push(`unblocks ${blocked.map((number) => `#${number}`).join(', ')}`);
    if (priority !== undefined) reasons.push(priority.label);
    reasons.push(`opened ${issue.createdAt.slice(0, 10)} (${daysSince(issue.createdAt, now)} days ago)`);
    return {
      blocking: blocked,
      createdAt: issue.createdAt,
      number: issue.number,
      priority: priority?.label ?? null,
      reasons,
      title: issue.title,
      umbrella:
        umbrella === undefined
          ? null
          : { completed: umbrella.subIssues.completed, number: umbrella.number, total: umbrella.subIssues.total },
      url: issue.url,
    };
  });
}

/**
 * Returns the open tickets that can be pulled: in the Now set, not excluded, every blocker closed, without an
 * in-progress signal or an assignee, and without open sub-issues of their own.
 */
export function selectCandidates(input: {
  inNow: (issue: Issue) => boolean;
  inProgress: ReadonlySet<number>;
  isExcluded: (issue: Issue) => boolean;
  open: readonly Issue[];
}): Issue[] {
  const { inNow, inProgress, isExcluded, open } = input;
  const openNumbers = new Set(open.map((issue) => issue.number));
  return open.filter(
    (issue) =>
      issue.state === 'open' &&
      inNow(issue) &&
      !isExcluded(issue) &&
      issue.blockedBy.every((blocker) => !openNumbers.has(blocker)) &&
      !inProgress.has(issue.number) &&
      issue.assignees.length === 0 &&
      issue.subIssues.completed >= issue.subIssues.total,
  );
}

// region | Helpers

/**
 * Orders two umbrellas: a ticket with one before a ticket without, then the higher completed ratio, then the older
 * parent, then the lower parent number, so that siblings stay together.
 */
function compareUmbrellas(a: Issue | undefined, b: Issue | undefined): number {
  if (a === undefined || b === undefined) return (a === undefined ? 1 : 0) - (b === undefined ? 1 : 0);
  return (
    b.subIssues.completed / b.subIssues.total - a.subIssues.completed / a.subIssues.total ||
    Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
    a.number - b.number
  );
}

/** Returns the highest-ranked priority label among `labels`, or `undefined` when none is recognized. */
function findPriority(labels: readonly string[], prefix: string): { label: string; rank: number } | undefined {
  let best: { label: string; rank: number } | undefined;
  for (const label of labels) {
    if (!label.startsWith(prefix)) continue;
    const value = label.slice(prefix.length).trim().toLowerCase();
    const rank = PRIORITIES.indexOf(value);
    if (rank !== -1 && (best === undefined || rank < best.rank)) best = { label, rank };
  }
  return best;
}

/** Returns whether `issue` has some completed sub-issues and some open ones. */
function isPartiallyDone(issue: Issue): boolean {
  return issue.subIssues.completed > 0 && issue.subIssues.completed < issue.subIssues.total;
}

/** Returns `label` trimmed and lower-cased, as label matching compares it. */
function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

// endregion | Helpers
