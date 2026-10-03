import type { Issue } from '../types.ts';

/** Builds an open issue without labels or comments, overridden by `overrides`. */
export function buildIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    body: 'Body',
    comments: [],
    createdAt: '2026-01-01T00:00:00Z',
    labels: [],
    number: 10,
    title: 'Ticket',
    updatedAt: '2026-02-01T00:00:00Z',
    url: 'https://github.com/owner/repo/issues/10',
    ...overrides,
  };
}
