/**
 * Resolves the Now set: the milestone named by `--now` or `ticket.pull.now`, else the open milestone with the nearest
 * due date, else the open milestone with the most open issues, else the whole backlog. A fallback skips a milestone
 * that does not have any open issue.
 */
import type { Milestone } from '../groom-backlog/fetch.ts';
import type { Issue } from '../groom-backlog/types.ts';

/** Where the Now set came from. */
export type NowSource = 'backlog' | 'config' | 'due-date' | 'flag' | 'most-issues';

/** The resolved Now set. A `null` milestone means the whole backlog. */
export interface NowSet {
  milestone: { dueOn: string | null; title: string } | null;
  /** The configured title that does not name an open milestone, or `null` when it does or none was configured. */
  notFound: string | null;
  source: NowSource;
}

/** Returns whether `issue` belongs to the Now set. */
export function isInNow(issue: Issue, now: NowSet): boolean {
  return now.milestone === null || issue.milestone?.title === now.milestone.title;
}

/** Resolves the Now set from the configured title, the repository's milestones, and the open issues. */
export function resolveNow(input: {
  configured: { source: 'config' | 'flag'; title: string } | undefined;
  issues: readonly Issue[];
  milestones: readonly Milestone[];
}): NowSet {
  const { configured, issues, milestones } = input;
  const open = milestones.filter((milestone) => milestone.state === 'open');

  let notFound: string | null = null;
  if (configured !== undefined) {
    const match = open.find((milestone) => milestone.title === configured.title);
    if (match !== undefined) return { milestone: toNowMilestone(match), notFound, source: configured.source };
    notFound = configured.title;
  }

  const openCounts = new Map<string, number>();
  for (const issue of issues) {
    if (issue.state !== 'open' || issue.milestone === null) continue;
    openCounts.set(issue.milestone.title, (openCounts.get(issue.milestone.title) ?? 0) + 1);
  }
  const populated = open.filter((milestone) => (openCounts.get(milestone.title) ?? 0) > 0);

  const nearest = populated
    .filter((milestone) => milestone.dueOn !== null)
    .toSorted((a, b) => Date.parse(a.dueOn ?? '') - Date.parse(b.dueOn ?? '') || a.number - b.number)[0];
  if (nearest !== undefined) return { milestone: toNowMilestone(nearest), notFound, source: 'due-date' };

  const largest = populated.toSorted(
    (a, b) => (openCounts.get(b.title) ?? 0) - (openCounts.get(a.title) ?? 0) || a.number - b.number,
  )[0];
  if (largest !== undefined) return { milestone: toNowMilestone(largest), notFound, source: 'most-issues' };

  return { milestone: null, notFound, source: 'backlog' };
}

// region | Helpers

/** Returns the fields of `milestone` that the Now set reports. */
function toNowMilestone(milestone: Milestone): { dueOn: string | null; title: string } {
  return { dueOn: milestone.dueOn, title: milestone.title };
}

// endregion | Helpers
