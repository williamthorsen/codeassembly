import { describe, expect, it } from 'vitest';

import { computeSignals } from '../signals.ts';
import type { InventoryEntry } from '../types.ts';

const NOW = new Date('2026-11-01T00:00:00Z');

/** Builds an inventory entry from the fields that a signal reads. */
function entry(fields: Partial<InventoryEntry> & { capturedAt: string }): InventoryEntry {
  return { id: fields.capturedAt, summary: '', excerpt: '', ...fields };
}

describe(computeSignals, () => {
  it('counts recurrence and impact and spans the capture dates', () => {
    const signals = computeSignals(
      [
        entry({ capturedAt: '2026-08-01T00:00:00Z', impact: 'high' }),
        entry({ capturedAt: '2026-06-01T00:00:00Z' }),
        entry({ capturedAt: '2026-07-01T00:00:00Z', impact: 'high' }),
      ],
      { now: NOW, deferDays: 30 },
    );
    expect(signals).toEqual({
      recurrence: 3,
      impact: { critical: 0, high: 2, medium: 0, low: 0, unrated: 1 },
      firstCapturedAt: '2026-06-01T00:00:00Z',
      latestCapturedAt: '2026-08-01T00:00:00Z',
      status: 'eligible',
    });
  });

  it('marks a cluster deferred-active when every member was deferred within the interval', () => {
    const signals = computeSignals(
      [
        entry({ capturedAt: '2026-06-01T00:00:00Z', deferredAt: '2026-09-01T00:00:00Z' }),
        entry({ capturedAt: '2026-06-02T00:00:00Z', deferredAt: '2026-10-20T00:00:00Z' }),
      ],
      { now: NOW, deferDays: 30 },
    );
    expect(signals.status).toBe('deferred-active');
  });

  it('makes a deferred cluster eligible once its latest deferral is older than the interval', () => {
    const signals = computeSignals(
      [entry({ capturedAt: '2026-06-01T00:00:00Z', deferredAt: '2026-09-01T00:00:00Z' })],
      {
        now: NOW,
        deferDays: 30,
      },
    );
    expect(signals.status).toBe('eligible');
  });

  it('makes a deferred cluster eligible once it gains an undeferred event', () => {
    const signals = computeSignals(
      [
        entry({ capturedAt: '2026-06-01T00:00:00Z', deferredAt: '2026-10-20T00:00:00Z' }),
        entry({ capturedAt: '2026-10-25T00:00:00Z' }),
      ],
      { now: NOW, deferDays: 30 },
    );
    expect(signals.status).toBe('eligible');
  });
});
