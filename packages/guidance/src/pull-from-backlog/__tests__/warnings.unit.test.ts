import { describe, expect, it } from 'vitest';

import type { LedgerRecord } from '../../groom-backlog/schemas.ts';
import { buildIssue } from '../../test-utils/build-issue.ts';
import { assessGroomStaleness, collectWarnings, type GroomStaleness, type InProgressEntry } from '../warnings.ts';

const NOW = new Date('2026-10-01T00:00:00Z');

const FRESH: GroomStaleness = {
  daysSince: 1,
  lastGroomAt: '2026-09-30T00:00:00Z',
  newTickets: 0,
  reasons: [],
  stale: false,
};

describe(assessGroomStaleness, () => {
  it('is stale when no groom has run, ignoring ripples and dry runs', () => {
    const records = [policy('ripple-5', '2026-09-30T00:00:00Z'), policy('r-dry-run', '2026-09-30T00:00:00Z')];

    expect(assess(records, [])).toMatchObject({ lastGroomAt: null, reasons: ['never'], stale: true });
  });

  it('is stale once the last groom is staleGroomDays old', () => {
    expect(assess([policy('r', '2026-09-18T00:00:00Z')], [])).toMatchObject({ daysSince: 13, stale: false });
    expect(assess([policy('r', '2026-09-17T00:00:00Z')], [])).toMatchObject({
      daysSince: 14,
      reasons: ['age'],
      stale: true,
    });
  });

  it('is stale once staleGroomNewTickets open tickets were created since the last groom', () => {
    const records = [policy('old', '2026-01-01T00:00:00Z'), policy('r', '2026-09-30T00:00:00Z')];
    const before = buildIssue({ createdAt: '2026-09-29T00:00:00Z' });
    const after = Array.from({ length: 10 }, (_, index) =>
      buildIssue({ number: index + 1, createdAt: NOW.toISOString() }),
    );

    expect(assess(records, [before, ...after.slice(1)])).toMatchObject({ newTickets: 9, stale: false });
    expect(assess(records, [before, ...after])).toMatchObject({
      newTickets: 10,
      reasons: ['new-tickets'],
      stale: true,
    });
  });
});

describe(collectWarnings, () => {
  it('warns about a missing Now milestone, a past-due milestone, a stale branch, an outside blocker, and a stale groom', () => {
    const outside = buildIssue({ number: 1, milestone: { dueOn: null, title: 'Later' } });
    const blocked = buildIssue({ number: 2, blockedBy: [1, 3] });
    const inside = buildIssue({ number: 3 });
    const inProgress: InProgressEntry[] = [
      entry({ number: 4, ref: '4-old', daysSinceLastCommit: 14 }),
      entry({ number: 5, ref: '5-new', daysSinceLastCommit: 13 }),
      entry({ number: 6, ref: null, daysSinceLastCommit: null }),
    ];

    const warnings = collectWarnings({
      groom: { ...FRESH, reasons: ['age'], stale: true },
      inNow: (issue) => issue.milestone === null,
      inProgress,
      milestones: [
        { dueOn: '2026-09-29T00:00:00Z', number: 1, state: 'open', title: 'Overdue' },
        { dueOn: '2026-10-05T00:00:00Z', number: 2, state: 'open', title: 'Upcoming' },
        { dueOn: '2026-01-01T00:00:00Z', number: 3, state: 'closed', title: 'Closed' },
      ],
      notFound: 'Missing',
      now: NOW,
      open: [outside, blocked, inside],
      staleBranchDays: 14,
    });

    expect(warnings).toStrictEqual([
      { kind: 'now-not-found', title: 'Missing' },
      { days: 2, kind: 'milestone-past-due', title: 'Overdue' },
      { days: 14, kind: 'stale-branch', number: 4, ref: '4-old' },
      { blockers: [1], kind: 'blocked-outside-now', number: 2 },
      { kind: 'groom-stale', reasons: ['age'] },
    ]);
  });

  it('returns nothing for a healthy backlog', () => {
    expect(
      collectWarnings({
        groom: FRESH,
        inNow: () => true,
        inProgress: [],
        milestones: [],
        notFound: null,
        now: NOW,
        open: [buildIssue()],
        staleBranchDays: 14,
      }),
    ).toStrictEqual([]);
  });
});

// region | Helpers

/** Assesses the groom under the default thresholds. */
function assess(records: LedgerRecord[], open: ReturnType<typeof buildIssue>[]): GroomStaleness {
  return assessGroomStaleness({ now: NOW, open, records, staleGroomDays: 14, staleGroomNewTickets: 10 });
}

/** Builds an in-progress entry, overridden by `overrides`. */
function entry(overrides: Partial<InProgressEntry>): InProgressEntry {
  return {
    assignees: [],
    daysSinceLastCommit: null,
    lastCommitAt: null,
    number: 10,
    ref: null,
    title: 'Ticket',
    ...overrides,
  };
}

/** Builds a `policy` record of run `run`, recorded at `recordedAt`. */
function policy(run: string, recordedAt: string): LedgerRecord {
  return { run, kind: 'policy', decisions: {}, decidedBy: 'user', recordedAt };
}

// endregion | Helpers
