import { describe, expect, it } from 'vitest';

import { checkRules, findPending, orderClusters, RecordSchema } from '../record-schema.ts';
import { buildCluster, buildPoolCluster, buildRecord } from '../test-utils/build-record.ts';

describe('RecordSchema', () => {
  it('accepts the fixture record', () => {
    expect(RecordSchema.safeParse(buildRecord()).success).toBe(true);
  });

  it('rejects a ticket-undecided suggestion with a target', () => {
    const record = buildRecord({
      clusters: [buildCluster({ suggested: { kind: 'ticket-undecided', target: null, repo: 'o/r' } })],
    });
    expect(RecordSchema.safeParse(record).success).toBe(true);
    const json: unknown = JSON.parse(JSON.stringify(record).replace('"target":null', '"target":"x.md"'));
    expect(RecordSchema.safeParse(json).success).toBe(false);
  });

  it('rejects a repo that is not owner/name', () => {
    const record = buildRecord({
      clusters: [buildCluster({ suggested: { kind: 'ticket-new', target: 'x.md', repo: 'codeassembly' } })],
    });
    expect(RecordSchema.safeParse(record).success).toBe(false);
  });
});

describe(checkRules, () => {
  it('accepts the fixture record', () => {
    expect(checkRules(buildRecord())).toEqual([]);
  });

  it('requires an artifact path that dates the deferral', () => {
    const violations = checkRules(buildRecord({ artifactPath: '~/ai-artifacts/triage.md' }));
    expect(violations).toEqual([{ cluster: null, message: expect.stringContaining('artifactPath') }]);
  });

  it('requires originalPriority exactly when the challenge modified the priority', () => {
    const modified = buildCluster({
      challenge: { argument: 'a', outcome: 'modified', note: 'n' },
    });
    const defended = buildCluster({
      challenge: { argument: 'a', outcome: 'defended', originalPriority: 'low', note: 'n' },
    });
    expect(
      checkRules(buildRecord({ clusters: [modified], remainder: { clusters: 0, events: 0, excluded: 0 } })),
    ).toEqual([{ cluster: 'sentence-case', message: 'a modified priority must record originalPriority' }]);
    expect(
      checkRules(buildRecord({ clusters: [defended], remainder: { clusters: 0, events: 0, excluded: 0 } })),
    ).toEqual([
      { cluster: 'sentence-case', message: 'originalPriority is set, but the challenge outcome is defended' },
    ]);
  });

  it('refuses a marked ticket disposition without a ticket, and a declined one with a result', () => {
    const violations = checkRules(
      buildRecord({
        clusters: [
          buildCluster({ result: { marked: true } }),
          buildCluster({ id: 'two', eventIds: ['01Z'], decision: 'declined', result: { marked: false } }),
        ],
        limit: 2,
        remainder: { clusters: 0, events: 0, excluded: 0 },
      }),
    );
    expect(violations.map((violation) => violation.message)).toEqual([
      'a ticket disposition cannot mark its events before the ticket exists',
      'only an approved or modified disposition may have a result',
    ]);
  });

  it('refuses an event in two clusters', () => {
    const violations = checkRules(
      buildRecord({
        clusters: [buildCluster(), buildCluster({ id: 'two' })],
        limit: 2,
        remainder: { clusters: 0, events: 0, excluded: 0 },
      }),
    );
    expect(violations.map((violation) => violation.message)).toEqual([
      'event "01A" is also in cluster "sentence-case"',
      'event "01B" is also in cluster "sentence-case"',
    ]);
  });

  it('requires the surfaced clusters to be the first in surfacing order, and the remainder to count the rest', () => {
    const swapped = buildRecord({
      clusters: [
        buildPoolCluster({ surfaced: true, suggested: { kind: 'defer' }, decision: 'approved', result: null }),
        buildPoolCluster({ id: 'sentence-case', eventIds: ['01A'], priority: 'high' }),
      ],
      remainder: { clusters: 1, events: 9, excluded: 0 },
    });
    expect(checkRules(swapped).map((violation) => violation.cluster)).toEqual(['sentence-case', 'commit-scope', null]);
  });
});

describe('unranked clusters', () => {
  it('counts them in the remainder', () => {
    const record = buildRecord({
      unranked: { clusters: 3, events: 7 },
      remainder: { clusters: 4, events: 8, excluded: 0 },
    });
    expect(checkRules(record)).toEqual([]);
    expect(checkRules({ ...record, remainder: { clusters: 1, events: 1, excluded: 0 } })).toEqual([
      { cluster: null, message: 'remainder must count 4 clusters and 8 events (got 1 and 1)' },
    ]);
  });
});

describe(orderClusters, () => {
  it('orders by priority, then recurrence, then latest capture', () => {
    const base = buildCluster();
    const clusters = [
      buildCluster({ id: 'low', priority: 'low' }),
      buildCluster({ id: 'high-older', signals: { ...base.signals, latestCapturedAt: '2026-01-01T00:00:00Z' } }),
      buildCluster({ id: 'high-newer' }),
      buildCluster({ id: 'high-frequent', signals: { ...base.signals, recurrence: 9 } }),
    ];
    expect(orderClusters(clusters).map((cluster) => cluster.id)).toEqual([
      'high-frequent',
      'high-newer',
      'high-older',
      'low',
    ]);
  });
});

describe(findPending, () => {
  it('lists the approved clusters whose events are not yet marked', () => {
    const record = buildRecord({
      limit: 3,
      clusters: [
        buildCluster({ id: 'fresh' }),
        buildCluster({ id: 'ticketed', result: { ticket: 'https://github.com/o/r/issues/1', marked: false } }),
        buildCluster({ id: 'done', result: { ticket: 'https://github.com/o/r/issues/2', marked: true } }),
        buildCluster({ id: 'declined', decision: 'declined' }),
      ],
    });
    expect(findPending(record)).toEqual(['fresh', 'ticketed']);
  });
});
