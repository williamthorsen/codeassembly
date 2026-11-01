import { describe, expect, it } from 'vitest';

import type { Inventory, InventoryEntry } from '../types.ts';
import { validateClusters } from '../validate-clusters.ts';

/** Builds an inventory entry with fixed defaults. */
function entry(id: string, deferredAt?: string): InventoryEntry {
  return {
    id,
    summary: id,
    capturedAt: '2026-06-18T09:41:02Z',
    excerpt: '',
    ...(deferredAt !== undefined && { deferredAt }),
  };
}

const INVENTORY: Inventory = {
  store: 'fixture',
  pool: [entry('a'), entry('b')],
  deferred: [entry('c', '2026-10-01T12:00:00Z')],
  skipped: [],
};

describe(validateClusters, () => {
  it('accepts a map that places every pool and deferred event once', () => {
    const map = {
      clusters: [
        { id: 'one', lesson: 'L1', eventIds: ['a', 'c'] },
        { id: 'two', lesson: 'L2', eventIds: ['b'] },
      ],
    };
    expect(validateClusters(INVENTORY, map)).toEqual([]);
  });

  it('reports every violation at once', () => {
    const map = {
      clusters: [
        { id: 'one', lesson: 'L1', eventIds: ['a', 'zzz'] },
        { id: 'one', lesson: 'L2', eventIds: ['a'] },
        { id: 'empty', lesson: 'L3', eventIds: [] },
      ],
    };
    expect(validateClusters(INVENTORY, map).map((violation) => violation.code)).toEqual([
      'unknown-event',
      'duplicate-cluster-id',
      'duplicate-event',
      'empty-cluster',
      'missing-event',
      'missing-event',
    ]);
  });
});
