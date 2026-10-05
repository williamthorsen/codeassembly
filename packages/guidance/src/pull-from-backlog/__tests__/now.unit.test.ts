import { describe, expect, it } from 'vitest';

import type { Milestone } from '../../groom-backlog/fetch.ts';
import { buildIssue } from '../../test-utils/build-issue.ts';
import { isInNow, resolveNow } from '../now.ts';

const MILESTONES: Milestone[] = [
  { dueOn: '2026-12-01T00:00:00Z', number: 1, state: 'open', title: 'Later' },
  { dueOn: '2026-11-01T00:00:00Z', number: 2, state: 'open', title: 'Sooner' },
  { dueOn: null, number: 3, state: 'open', title: 'Undated' },
  { dueOn: '2026-01-01T00:00:00Z', number: 4, state: 'closed', title: 'Done' },
];

const ISSUES = [
  buildIssue({ number: 1, milestone: { dueOn: '2026-12-01T00:00:00Z', title: 'Later' } }),
  buildIssue({ number: 2, milestone: { dueOn: '2026-11-01T00:00:00Z', title: 'Sooner' } }),
  buildIssue({ number: 3, milestone: { dueOn: null, title: 'Undated' } }),
  buildIssue({ number: 4, milestone: { dueOn: null, title: 'Undated' } }),
  buildIssue({ number: 5 }),
];

describe(resolveNow, () => {
  it('takes the configured milestone when it is open', () => {
    expect(
      resolveNow({ configured: { source: 'config', title: 'Later' }, issues: ISSUES, milestones: MILESTONES }),
    ).toStrictEqual({ milestone: { dueOn: '2026-12-01T00:00:00Z', title: 'Later' }, notFound: null, source: 'config' });
  });

  it('reports a configured milestone that is not open, and falls back', () => {
    expect(
      resolveNow({ configured: { source: 'flag', title: 'Done' }, issues: ISSUES, milestones: MILESTONES }),
    ).toMatchObject({ milestone: { title: 'Sooner' }, notFound: 'Done', source: 'due-date' });
  });

  it('falls back to the open milestone with the nearest due date', () => {
    expect(resolveNow({ configured: undefined, issues: ISSUES, milestones: MILESTONES })).toMatchObject({
      milestone: { title: 'Sooner' },
      source: 'due-date',
    });
  });

  it('skips a dated milestone without open issues', () => {
    const issues = ISSUES.filter((issue) => issue.number !== 2);

    expect(resolveNow({ configured: undefined, issues, milestones: MILESTONES })).toMatchObject({
      milestone: { title: 'Later' },
      source: 'due-date',
    });
  });

  it('falls back to the open milestone with the most open issues when none is dated', () => {
    const milestones = MILESTONES.map((milestone) => ({ ...milestone, dueOn: null }));

    expect(resolveNow({ configured: undefined, issues: ISSUES, milestones })).toMatchObject({
      milestone: { title: 'Undated' },
      source: 'most-issues',
    });
  });

  it('falls back to the whole backlog when no open milestone has an open issue', () => {
    expect(resolveNow({ configured: undefined, issues: [buildIssue()], milestones: MILESTONES })).toStrictEqual({
      milestone: null,
      notFound: null,
      source: 'backlog',
    });
  });
});

describe(isInNow, () => {
  it('matches the milestone by title, and every issue for the whole backlog', () => {
    const now = resolveNow({ configured: undefined, issues: ISSUES, milestones: MILESTONES });
    const backlog = resolveNow({ configured: undefined, issues: [], milestones: [] });

    expect(ISSUES.filter((issue) => isInNow(issue, now)).map((issue) => issue.number)).toStrictEqual([2]);
    expect(ISSUES.every((issue) => isInNow(issue, backlog))).toBe(true);
  });
});
