import type { Issue } from '../types.ts';

/** Builds an open issue without labels, comments, or relations, overridden by `overrides`. */
export function buildIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    assignees: [],
    blockedBy: [],
    body: 'Body',
    closedAt: null,
    comments: [],
    createdAt: '2026-01-01T00:00:00Z',
    labels: [],
    milestone: null,
    number: 10,
    parent: null,
    state: 'open',
    subIssues: { completed: 0, total: 0 },
    title: 'Ticket',
    updatedAt: '2026-02-01T00:00:00Z',
    url: 'https://github.com/owner/repo/issues/10',
    ...overrides,
  };
}
