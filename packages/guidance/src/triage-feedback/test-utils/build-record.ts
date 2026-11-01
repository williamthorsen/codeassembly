import type { Cluster, TriageRecord } from '../record-schema.ts';

/** Builds a valid surfaced cluster with an approved ticket disposition and no writes yet, overridden by `overrides`. */
export function buildCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 'sentence-case',
    lesson: 'Headings use sentence case.',
    eventIds: ['01A', '01B'],
    signals: {
      recurrence: 2,
      impact: { critical: 0, high: 1, medium: 0, low: 0, unrated: 1 },
      firstCapturedAt: '2026-09-01T00:00:00Z',
      latestCapturedAt: '2026-10-05T00:00:00Z',
      status: 'eligible',
    },
    priority: 'high',
    reason: 'Recurs across skills and reaches published text.',
    challenge: { argument: 'The rulebook already states it.', outcome: 'defended', note: 'Stated, but not applied.' },
    surfaced: true,
    suggested: { kind: 'ticket-existing', target: 'content/rulebooks/writing.md', repo: 'o/r' },
    decision: 'approved',
    result: null,
    ...overrides,
  };
}

/** Builds a valid record with one surfaced cluster and one cluster left in the pool, overridden by `overrides`. */
export function buildRecord(overrides: Partial<TriageRecord> = {}): TriageRecord {
  return {
    store: 'codeassembly',
    limit: 1,
    artifactPath: '~/ai-artifacts/projects/codeassembly/feedback-triage/20261101-120000Z_triage_feedback-triage.md',
    clusters: [buildCluster(), buildPoolCluster()],
    unranked: { clusters: 0, events: 0 },
    remainder: { clusters: 1, events: 1, excluded: 0 },
    ...overrides,
  };
}

/** Builds a valid cluster that a run leaves in the pool, overridden by `overrides`. */
export function buildPoolCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 'commit-scope',
    lesson: 'Commit titles take the workspace prefix.',
    eventIds: ['01C'],
    signals: {
      recurrence: 1,
      impact: { critical: 0, high: 0, medium: 0, low: 0, unrated: 1 },
      firstCapturedAt: '2026-08-01T00:00:00Z',
      latestCapturedAt: '2026-08-01T00:00:00Z',
      status: 'eligible',
    },
    priority: 'low',
    reason: 'Seen once.',
    challenge: { argument: 'It recurs in other repos.', outcome: 'defended', note: 'Not in this store.' },
    surfaced: false,
    ...overrides,
  };
}
