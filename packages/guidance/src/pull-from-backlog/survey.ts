/** Assembles the survey's picture, candidates, and warnings from data already fetched, without any I/O. */
import type { Milestone } from '../groom-backlog/fetch.ts';
import type { LedgerRecord } from '../groom-backlog/schemas.ts';
import type { InProgress, Issue } from '../groom-backlog/types.ts';
import { daysSince } from './days.ts';
import { isInNow, type NowSet, resolveNow } from './now.ts';
import { hasExcludedLabel, rankCandidates, type RankedCandidate, selectCandidates } from './rank.ts';
import type { PullConfig } from './schemas.ts';
import {
  assessGroomStaleness,
  collectWarnings,
  type GroomStaleness,
  type InProgressEntry,
  type Warning,
} from './warnings.ts';

/** A ranked candidate, marked by whether it belongs to the Now set or fills the menu from outside it. */
export type SurveyCandidate = RankedCandidate & { inNow: boolean };

/** The survey's result, less the ledger paths that the CLI adds. */
export interface Survey {
  blocked: Array<{ blockedBy: number[]; number: number; title: string }>;
  candidates: SurveyCandidate[];
  counts: { candidates: number; excluded: number; inNow: number; open: number };
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
  /** Returns whether `issue` carries a `ticket.pull.excludeLabels` label. */
  function isExcluded(issue: Issue): boolean {
    return hasExcludedLabel(issue, config.excludeLabels);
  }
  const eligible = open.filter((issue) => !isExcluded(issue));
  const nowSet = resolveNow({ configured: pickConfiguredNow(nowFlag, config.now), issues: eligible, milestones });
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

  /** Returns the ranked candidates that `scope` admits. */
  function rankScope(scope: (issue: Issue) => boolean): RankedCandidate[] {
    return rankCandidates({
      candidates: selectCandidates({ inNow: scope, inProgress: busy, isExcluded, open }),
      now,
      open,
      priorityPrefix: config.priorityPrefix,
    });
  }
  const candidates = rankScope(inNow);
  const menu: SurveyCandidate[] = candidates.slice(0, limit).map((candidate) => ({ ...candidate, inNow: true }));
  // Fill the menu from outside Now only when Now is a milestone; a whole-backlog Now leaves nothing outside it.
  if (menu.length < limit && nowSet.milestone !== null) {
    const outside = rankScope((issue) => !inNow(issue)).slice(0, limit - menu.length);
    menu.push(...outside.map((candidate) => ({ ...candidate, inNow: false })));
  }

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
    candidates: menu,
    counts: {
      candidates: candidates.length,
      excluded: open.length - eligible.length,
      inNow: eligible.filter(inNow).length,
      open: open.length,
    },
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
