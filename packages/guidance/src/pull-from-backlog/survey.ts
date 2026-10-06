/** Assembles the survey's picture, candidates, and warnings from data already fetched, without any I/O. */
import type { Milestone } from '../groom-backlog/fetch.ts';
import type { LedgerRecord } from '../groom-backlog/schemas.ts';
import type { InProgress, Issue } from '../groom-backlog/types.ts';
import { daysSince } from './days.ts';
import { isInNow, type NowSet, resolveNow } from './now.ts';
import { rankCandidates, type RankedCandidate, selectCandidates } from './rank.ts';
import type { PullConfig } from './schemas.ts';
import {
  assessGroomStaleness,
  collectWarnings,
  type GroomStaleness,
  type InProgressEntry,
  type Warning,
} from './warnings.ts';

/** The survey's result, less the ledger paths that the CLI adds. */
export interface Survey {
  blocked: Array<{ blockedBy: number[]; number: number; title: string }>;
  candidates: RankedCandidate[];
  counts: { candidates: number; inNow: number; open: number };
  groomStale: GroomStaleness;
  inProgress: InProgressEntry[];
  now: NowSet;
  umbrellas: Array<{ completed: number; number: number; title: string; total: number }>;
  user: string;
  warnings: Warning[];
  yours: InProgressEntry[];
}

/** Builds the survey from the open issues, the milestones, the in-progress signals, and the ledger. */
export function buildSurvey(input: {
  config: PullConfig;
  inProgress: ReadonlyMap<number, InProgress>;
  limit: number;
  milestones: readonly Milestone[];
  now: Date;
  nowFlag: string | undefined;
  open: readonly Issue[];
  records: readonly LedgerRecord[];
  user: string;
}): Survey {
  const { config, inProgress, limit, milestones, now, nowFlag, open, records, user } = input;
  const nowSet = resolveNow({ configured: pickConfiguredNow(nowFlag, config.now), issues: open, milestones });
  /** Returns whether `issue` belongs to the resolved Now set. */
  function inNow(issue: Issue): boolean {
    return isInNow(issue, nowSet);
  }
  const nowIssues = open.filter(inNow);
  const openNumbers = new Set(open.map((issue) => issue.number));

  const inProgressEntries = open
    .filter((issue) => inProgress.has(issue.number) || issue.assignees.length > 0)
    .map((issue) => toInProgressEntry(issue, inProgress.get(issue.number), now));
  const busy = new Set(inProgressEntries.map((entry) => entry.number));

  const candidates = rankCandidates({
    candidates: selectCandidates({ inNow, inProgress: busy, open }),
    now,
    open,
    priorityPrefix: config.priorityPrefix,
  });

  const groomStale = assessGroomStaleness({
    now,
    open,
    records,
    staleGroomDays: config.staleGroomDays,
    staleGroomNewTickets: config.staleGroomNewTickets,
  });

  const parentsOfNow = new Set(nowIssues.flatMap((issue) => (issue.parent === null ? [] : [issue.parent])));
  const umbrellas = open
    .filter((issue) => issue.subIssues.total > 0 && (inNow(issue) || parentsOfNow.has(issue.number)))
    .map((issue) => ({ ...issue.subIssues, number: issue.number, title: issue.title }));

  const blocked = nowIssues.flatMap((issue) => {
    const blockedBy = issue.blockedBy.filter((blocker) => openNumbers.has(blocker));
    return blockedBy.length === 0 ? [] : [{ blockedBy, number: issue.number, title: issue.title }];
  });

  return {
    blocked,
    candidates: candidates.slice(0, limit),
    counts: { candidates: candidates.length, inNow: nowIssues.length, open: open.length },
    groomStale,
    inProgress: inProgressEntries,
    now: nowSet,
    umbrellas,
    user,
    warnings: collectWarnings({
      groom: groomStale,
      inNow,
      inProgress: inProgressEntries,
      milestones,
      notFound: nowSet.notFound,
      now,
      open,
      staleBranchDays: config.staleBranchDays,
    }),
    yours: inProgressEntries.filter((entry) => entry.assignees.includes(user)),
  };
}

// region | Helpers

/** Returns the Now milestone named by `--now`, else by `ticket.pull.now`, else `undefined`. */
function pickConfiguredNow(
  flag: string | undefined,
  config: string | undefined,
): { source: 'config' | 'flag'; title: string } | undefined {
  if (flag !== undefined) return { source: 'flag', title: flag };
  return config === undefined ? undefined : { source: 'config', title: config };
}

/** Returns the survey's entry for an in-progress or assigned ticket. */
function toInProgressEntry(issue: Issue, signal: InProgress | undefined, now: Date): InProgressEntry {
  const lastCommitAt = signal === undefined || signal.lastCommitAt === '' ? null : signal.lastCommitAt;
  return {
    assignees: issue.assignees,
    daysSinceLastCommit: lastCommitAt === null ? null : daysSince(lastCommitAt, now),
    lastCommitAt,
    number: issue.number,
    ref: signal?.ref ?? null,
    title: issue.title,
  };
}

// endregion | Helpers
