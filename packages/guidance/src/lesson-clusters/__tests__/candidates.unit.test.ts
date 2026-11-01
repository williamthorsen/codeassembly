import { describe, expect, it } from 'vitest';

import { selectCandidates } from '../candidates.ts';
import type { ClusterSignals, SignalledCluster } from '../types.ts';

/** Builds a cluster whose signals take fixed defaults, overridden by `signals`. */
function cluster(id: string, signals: Partial<ClusterSignals> = {}): SignalledCluster {
  return {
    id,
    lesson: id,
    eventIds: [id],
    signals: {
      recurrence: 1,
      impact: { critical: 0, high: 0, medium: 0, low: 0, unrated: 1 },
      firstCapturedAt: '2026-01-01T00:00:00Z',
      latestCapturedAt: '2026-01-01T00:00:00Z',
      status: 'eligible',
      ...signals,
    },
  };
}

describe(selectCandidates, () => {
  it('lets each signal nominate its own top clusters', () => {
    const clusters = [
      cluster('frequent', { recurrence: 9 }),
      cluster('also-frequent', { recurrence: 8 }),
      cluster('critical', { impact: { critical: 1, high: 0, medium: 0, low: 0, unrated: 0 } }),
      cluster('recent', { latestCapturedAt: '2026-10-31T00:00:00Z' }),
      cluster('ordinary'),
    ];
    expect([...selectCandidates(clusters, 1)].toSorted()).toEqual(['critical', 'frequent', 'recent']);
  });

  it('does not nominate by impact a cluster without any high or critical rating', () => {
    const clusters = [cluster('a', { recurrence: 2, latestCapturedAt: '2026-10-31T00:00:00Z' }), cluster('b')];
    expect([...selectCandidates(clusters, 1)]).toEqual(['a']);
  });
});
