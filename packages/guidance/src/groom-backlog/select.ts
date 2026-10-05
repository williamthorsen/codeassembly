/** Narrows the backlog by the caller's selectors, groups the tickets, and packs dispatch waves. */
import type { InProgress, Issue, Selectors, TicketGroup } from './types.ts';

/** The most assessors that one wave dispatches together. */
export const WAVE_SIZE = 4;

const SCOPE_PREFIX = 'scope:';

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Keeps the issues that every selector admits. `--scope` admits an issue with any of the named scope labels,
 * `--exclude-label` drops an issue with any of the named labels, and `--older-than` admits an issue last updated
 * before the cutoff. `--limit` is not applied here, because the resume rule runs between selection and the cap.
 */
export function applySelectors(issues: readonly Issue[], selectors: Selectors, now: Date): Issue[] {
  const scopes = new Set(selectors.scopes.map(normalizeScope));
  const excluded = new Set(selectors.excludeLabels);
  const cutoff = selectors.olderThanDays === undefined ? undefined : now.getTime() - selectors.olderThanDays * DAY_MS;

  return issues.filter((issue) => {
    if (scopes.size > 0 && issue.labels.every((label) => !scopes.has(label))) return false;
    if (issue.labels.some((label) => excluded.has(label))) return false;
    if (cutoff !== undefined && Date.parse(issue.updatedAt) >= cutoff) return false;
    return true;
  });
}

/**
 * Groups `issues` by scope label, alphabetically, with the unscoped group last; each group is ordered oldest first and
 * packed into waves of up to `WAVE_SIZE`. An issue with several scope labels joins the group of the first one
 * alphabetically.
 */
export function groupByScope(issues: readonly Issue[], inProgress: ReadonlyMap<number, InProgress>): TicketGroup[] {
  const byScope = new Map<string | null, Issue[]>();
  for (const issue of issues) {
    const scope = readScope(issue);
    byScope.set(scope, [...(byScope.get(scope) ?? []), issue]);
  }

  const scopes = byScope.keys().toArray().toSorted(compareScopes);
  return scopes.map((scope) =>
    buildGroup(
      scope,
      (byScope.get(scope) ?? []).toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.number - b.number),
      inProgress,
    ),
  );
}

/** Puts `issues` in one unscoped group in the order given, packed into waves of up to `WAVE_SIZE`. */
export function groupInOrder(issues: readonly Issue[], inProgress: ReadonlyMap<number, InProgress>): TicketGroup[] {
  return issues.length === 0 ? [] : [buildGroup(null, issues, inProgress)];
}

/** Returns `issues` in sweep order: by scope as `groupByScope` orders the groups, then oldest first. */
export function orderForSweep(issues: readonly Issue[]): Issue[] {
  return groupByScope(issues, new Map()).flatMap((group) =>
    group.tickets.flatMap((ticket) => issues.filter((issue) => issue.number === ticket.number)),
  );
}

/** Parses an `--older-than` value, `<N>d` or `<N>w`, into days. Throws on any other form. */
export function parseAge(value: string): number {
  const match = /^([1-9]\d*)([dw])$/.exec(value);
  if (match?.[1] === undefined) {
    throw new Error(`--older-than takes <N>d or <N>w, got "${value}"`);
  }
  return Number(match[1]) * (match[2] === 'w' ? 7 : 1);
}

/** Returns the issue's scope name: its first `scope:*` label alphabetically, without the prefix. */
export function readScope(issue: Issue): string | null {
  const scope = issue.labels
    .filter((label) => label.startsWith(SCOPE_PREFIX))
    .toSorted()
    .at(0);
  return scope === undefined ? null : scope.slice(SCOPE_PREFIX.length);
}

// region | Helpers

/** Builds the group of `scope` from its members, in the order given. */
function buildGroup(
  scope: string | null,
  members: readonly Issue[],
  inProgress: ReadonlyMap<number, InProgress>,
): TicketGroup {
  return {
    scope,
    tickets: members.map((issue) => ({
      inProgress: inProgress.get(issue.number) ?? null,
      number: issue.number,
      title: issue.title,
      updatedAt: issue.updatedAt,
    })),
    waves: packWaves(members.map((issue) => issue.number)),
  };
}

/** Orders scopes alphabetically, with the unscoped group last. */
function compareScopes(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

/** Accepts a scope as `name` or as `scope:name`, and returns the label. */
function normalizeScope(scope: string): string {
  return scope.startsWith(SCOPE_PREFIX) ? scope : `${SCOPE_PREFIX}${scope}`;
}

/** Splits `numbers` into consecutive waves of up to `WAVE_SIZE`. */
function packWaves(numbers: readonly number[]): number[][] {
  const waves: number[][] = [];
  for (let start = 0; start < numbers.length; start += WAVE_SIZE) {
    waves.push(numbers.slice(start, start + WAVE_SIZE));
  }
  return waves;
}

// endregion | Helpers
