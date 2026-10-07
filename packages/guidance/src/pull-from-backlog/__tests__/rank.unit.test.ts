import { describe, expect, it } from 'vitest';

import type { Issue } from '../../groom-backlog/types.ts';
import { buildIssue } from '../../test-utils/build-issue.ts';
import { hasExcludedLabel, rankCandidates, selectCandidates } from '../rank.ts';

const NOW = new Date('2026-10-01T00:00:00Z');

describe(hasExcludedLabel, () => {
  it('matches an excluded label trimmed and without regard to case', () => {
    const issue = buildIssue({ labels: ['bug', 'Status:Blocked '] });

    expect(hasExcludedLabel(issue, ['status:blocked'])).toBe(true);
    expect(hasExcludedLabel(issue, ['status:on-hold'])).toBe(false);
    expect(hasExcludedLabel(issue, [])).toBe(false);
  });
});

describe(selectCandidates, () => {
  const open = [
    buildIssue({ number: 1 }),
    buildIssue({ number: 2, blockedBy: [1] }),
    buildIssue({ number: 3, blockedBy: [99] }),
    buildIssue({ number: 4 }),
    buildIssue({ number: 5, assignees: ['someone'] }),
    buildIssue({ number: 6, milestone: { dueOn: null, title: 'Later' } }),
    buildIssue({ number: 7, subIssues: { completed: 1, total: 2 } }),
    buildIssue({ number: 8, subIssues: { completed: 2, total: 2 } }),
  ];

  it('keeps the open Now tickets whose blockers are closed, without a signal, an assignee, or open sub-issues', () => {
    const selected = selectCandidates({
      inNow: (issue) => issue.milestone === null,
      inProgress: new Set([4]),
      isExcluded: () => false,
      open,
    });

    // #2 has an open blocker, #4 is in progress, #5 is assigned, #6 is outside Now, and #7 has an open sub-issue.
    expect(selected.map((issue) => issue.number)).toStrictEqual([1, 3, 8]);
  });

  it('drops an excluded ticket, and keeps a ticket blocked by an open excluded one out', () => {
    const shelved = buildIssue({ number: 1, labels: ['status:on-hold'] });
    const blockedByShelved = buildIssue({ number: 2, blockedBy: [1] });
    const free = buildIssue({ number: 3 });

    const selected = selectCandidates({
      inNow: () => true,
      inProgress: new Set(),
      isExcluded: (issue) => hasExcludedLabel(issue, ['status:on-hold']),
      open: [shelved, blockedByShelved, free],
    });

    expect(selected.map((issue) => issue.number)).toStrictEqual([3]);
  });
});

describe(rankCandidates, () => {
  it('ranks a child of a partially-done umbrella first, with its reason', () => {
    const parent = buildIssue({ number: 50, subIssues: { completed: 1, total: 3 } });
    const child = buildIssue({ number: 2, parent: 50, createdAt: '2026-09-01T00:00:00Z' });
    const old = buildIssue({ number: 1, createdAt: '2026-01-01T00:00:00Z' });

    const ranked = rank([old, child], [parent, old, child]);

    expect(ranked.map((candidate) => candidate.number)).toStrictEqual([2, 1]);
    expect(ranked[0]).toMatchObject({
      umbrella: { number: 50, completed: 1, total: 3 },
      reasons: ['continues #50 (1/3 done)', 'opened 2026-09-01 (30 days ago)'],
    });
  });

  it('does not count an umbrella without completed children, or with every child completed', () => {
    const fresh = buildIssue({ number: 50, subIssues: { completed: 0, total: 3 } });
    const child = buildIssue({ number: 2, parent: 50, createdAt: '2026-09-01T00:00:00Z' });
    const old = buildIssue({ number: 1, createdAt: '2026-01-01T00:00:00Z' });

    expect(rank([child, old], [fresh, child, old]).map((candidate) => candidate.number)).toStrictEqual([1, 2]);
  });

  it('breaks an umbrella tie by the higher completed ratio, then by the older parent', () => {
    const half = buildIssue({ number: 50, subIssues: { completed: 1, total: 2 }, createdAt: '2026-05-01T00:00:00Z' });
    const third = buildIssue({ number: 51, subIssues: { completed: 1, total: 3 }, createdAt: '2026-01-01T00:00:00Z' });
    const olderHalf = buildIssue({
      number: 52,
      subIssues: { completed: 2, total: 4 },
      createdAt: '2026-02-01T00:00:00Z',
    });
    const children = [
      buildIssue({ number: 1, parent: 51 }),
      buildIssue({ number: 2, parent: 50 }),
      buildIssue({ number: 3, parent: 52 }),
    ];

    const ranked = rank(children, [half, third, olderHalf, ...children]);

    expect(ranked.map((candidate) => candidate.umbrella?.number)).toStrictEqual([52, 50, 51]);
  });

  it('ranks by the open tickets blocked, then by priority, then oldest first', () => {
    const blocker = buildIssue({ number: 1, createdAt: '2026-06-01T00:00:00Z' });
    const high = buildIssue({
      number: 2,
      labels: ['priority:low', 'priority:high'],
      createdAt: '2026-07-01T00:00:00Z',
    });
    const low = buildIssue({ number: 3, labels: ['priority:low'], createdAt: '2026-02-01T00:00:00Z' });
    const unknown = buildIssue({ number: 4, labels: ['priority:urgent'], createdAt: '2026-03-01T00:00:00Z' });
    const unlabelled = buildIssue({ number: 5, createdAt: '2026-01-01T00:00:00Z' });
    const blocked = buildIssue({ number: 9, blockedBy: [1] });
    const candidates = [unlabelled, unknown, low, high, blocker];

    const ranked = rank(candidates, [...candidates, blocked]);

    expect(ranked.map((candidate) => candidate.number)).toStrictEqual([1, 2, 3, 5, 4]);
    expect(ranked[0]).toMatchObject({ blocking: [9], reasons: ['unblocks #9', expect.stringMatching(/^opened/)] });
    expect(ranked[1]).toMatchObject({ priority: 'priority:high', reasons: ['priority:high', expect.any(String)] });
    expect(ranked[4]).toMatchObject({ priority: null });
  });

  it('reads priority under a configured prefix', () => {
    const tagged = buildIssue({ number: 2, labels: ['P: medium'], createdAt: '2026-09-01T00:00:00Z' });
    const old = buildIssue({ number: 1, createdAt: '2026-01-01T00:00:00Z' });

    const ranked = rankCandidates({ candidates: [old, tagged], now: NOW, open: [old, tagged], priorityPrefix: 'P:' });

    expect(ranked.map((candidate) => candidate.number)).toStrictEqual([2, 1]);
  });
});

// region | Helpers

/** Ranks `candidates` against `open` under the default priority prefix. */
function rank(candidates: Issue[], open: Issue[]): ReturnType<typeof rankCandidates> {
  return rankCandidates({ candidates, now: NOW, open, priorityPrefix: 'priority:' });
}

// endregion | Helpers
