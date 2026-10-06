import { describe, expect, it } from 'vitest';

import { buildFakeRunner } from '../../test-utils/fake-runner.ts';
import { fetchIssue, fetchMilestones, parseIssueList } from '../fetch.ts';

/** A `gh issue` record as gh 2.100 returns it, without any relations. */
const PLAIN_ISSUE = {
  number: 10,
  title: 'Ticket',
  body: 'Body',
  url: 'https://github.com/owner/repo/issues/10',
  state: 'OPEN',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
  closedAt: null,
  labels: [{ name: 'scope:kb' }],
  comments: [{ author: null, body: 'Hello', createdAt: '2026-01-02T00:00:00Z' }],
  assignees: [],
  milestone: null,
  parent: null,
  blockedBy: { nodes: [], totalCount: 0 },
  subIssuesSummary: { completed: 0, percentCompleted: 0, total: 0 },
};

/** The same issue, closed, with every relation set. */
const RELATED_ISSUE = {
  ...PLAIN_ISSUE,
  state: 'CLOSED',
  closedAt: '2026-03-01T00:00:00Z',
  assignees: [{ id: 'U_1', login: 'octocat', name: 'Octo Cat' }],
  milestone: { number: 1, title: 'Catwalk 2', description: '', dueOn: '2026-12-01T00:00:00Z' },
  parent: { id: 'I_1', number: 7, state: 'OPEN', title: 'Umbrella', url: 'https://github.com/owner/repo/issues/7' },
  blockedBy: {
    nodes: [
      { id: 'I_2', number: 8, state: 'CLOSED', title: 'Blocker', url: '' },
      { id: 'I_3', number: 9, state: 'OPEN', title: 'Blocker', url: '' },
    ],
    totalCount: 2,
  },
  subIssuesSummary: { completed: 1, percentCompleted: 50, total: 2 },
};

describe(parseIssueList, () => {
  it('maps an issue without relations to empty relations', () => {
    expect(parseIssueList([PLAIN_ISSUE])).toStrictEqual([
      {
        assignees: [],
        blockedBy: [],
        body: 'Body',
        closedAt: null,
        comments: [{ author: 'ghost', body: 'Hello', createdAt: '2026-01-02T00:00:00Z' }],
        createdAt: '2026-01-01T00:00:00Z',
        labels: ['scope:kb'],
        milestone: null,
        number: 10,
        parent: null,
        state: 'open',
        subIssues: { completed: 0, total: 0 },
        title: 'Ticket',
        updatedAt: '2026-02-01T00:00:00Z',
        url: 'https://github.com/owner/repo/issues/10',
      },
    ]);
  });

  it('reduces each relation to issue numbers', () => {
    expect(parseIssueList([RELATED_ISSUE])).toStrictEqual([
      expect.objectContaining({
        assignees: ['octocat'],
        blockedBy: [8, 9],
        closedAt: '2026-03-01T00:00:00Z',
        milestone: { title: 'Catwalk 2', dueOn: '2026-12-01T00:00:00Z' },
        parent: 7,
        state: 'closed',
        subIssues: { completed: 1, total: 2 },
      }),
    ]);
  });

  it('names the field that an older gh does not return', () => {
    const { blockedBy: _omitted, ...withoutBlockedBy } = PLAIN_ISSUE;

    expect(() => parseIssueList([withoutBlockedBy])).toThrow(/blockedBy/);
  });
});

describe(fetchIssue, () => {
  it('reads one issue in any state through gh issue view', async () => {
    const runner = buildFakeRunner(() => JSON.stringify(RELATED_ISSUE));

    await expect(fetchIssue(runner.run, '/repo', 10)).resolves.toMatchObject({ number: 10, state: 'closed' });
    expect(runner.calls[0]?.args.slice(0, 3)).toStrictEqual(['issue', 'view', '10']);
  });
});

describe(fetchMilestones, () => {
  it('flattens the slurped pages', async () => {
    const page = (number: number) => [{ number, title: `M${number}`, due_on: null, state: 'open' }];
    const runner = buildFakeRunner(() => JSON.stringify([page(1), page(2)]));

    await expect(fetchMilestones(runner.run, '/repo')).resolves.toMatchObject([{ number: 1 }, { number: 2 }]);
  });
});
