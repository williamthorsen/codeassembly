import { renderMarker } from '../marker.ts';

// The relation fields precede the issue lists, which spread them when the module loads.
/** The `gh` relation fields of an issue that does not have any relations. */
const NO_RELATIONS = {
  state: 'OPEN',
  closedAt: null,
  assignees: [],
  milestone: null,
  parent: null,
  blockedBy: { nodes: [], totalCount: 0 },
  subIssuesSummary: { completed: 0, percentCompleted: 0, total: 0 },
};

/** Builds an assessment record of ticket `number` in `run`. */
export function assessment(run: string, number: number, assessedAt: string): Record<string, unknown> {
  return {
    run,
    kind: 'assessment',
    number,
    assessedAt,
    sha: 'abc1234',
    ticketUpdatedAt: '2026-01-01T00:00:00Z',
    verdicts: { drift: 'none', relevance: 'uncertain', progress: 'none', advisability: 'advisable', complexity: null },
    recommendation: 'escalate',
    confidence: 'medium',
    reason: 'Unclear',
    relatedTickets: [],
    inProgress: null,
  };
}

/** The closed issues that the fake `gh issue view` returns. */
export const CLOSED_ISSUES = [19, 20, 21].map((number) => ({
  number,
  title: `Closed ticket ${number}`,
  body: 'Body',
  url: `https://github.com/owner/repo/issues/${number}`,
  ...NO_RELATIONS,
  state: 'CLOSED',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: `2026-08-${number - 5}T00:00:00Z`,
  closedAt: `2026-08-${number - 5}T00:00:00Z`,
  labels: [],
  comments: [],
}));

/** The open issues that the fake `gh issue list` returns. */
export const ISSUES = [
  {
    number: 10,
    title: 'Old agents ticket',
    body: 'Body',
    url: 'https://github.com/owner/repo/issues/10',
    ...NO_RELATIONS,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    labels: [{ name: 'scope:agents' }],
    comments: [
      {
        author: { login: 'owner' },
        body: renderMarker({ run: 'cal', decision: 'keep' }),
        createdAt: '2026-01-15T00:00:00Z',
      },
    ],
  },
  {
    number: 11,
    title: 'Blocked ticket',
    body: 'Body',
    url: 'https://github.com/owner/repo/issues/11',
    ...NO_RELATIONS,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    labels: [{ name: 'blocked' }],
    comments: [],
  },
  {
    number: 12,
    title: 'Unscoped ticket',
    body: 'Body',
    url: 'https://github.com/owner/repo/issues/12',
    ...NO_RELATIONS,
    createdAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    labels: [],
    comments: [],
  },
];

export const NOW = new Date('2026-10-01T12:00:00Z');
