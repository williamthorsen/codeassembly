import { describe, expect, it } from 'vitest';

import { buildLessonInventory, type ClusteredBatch, combineMaps, splitInventory } from '../batches.ts';
import type { Inventory, InventoryEntry } from '../types.ts';

/** Builds an inventory entry with fixed defaults. */
function entry(id: string, fields: Partial<InventoryEntry> = {}): InventoryEntry {
  return { id, summary: `Summary ${id}`, capturedAt: '2026-10-01T00:00:00Z', excerpt: '', ...fields };
}

/** Builds an inventory from pool and deferred entries. */
function inventory(pool: InventoryEntry[], deferred: InventoryEntry[] = []): Inventory {
  return { store: 'fixture', pool, deferred, skipped: [] };
}

describe(splitInventory, () => {
  it('groups by skill, then by capture time, leaving the events without a skill last', () => {
    const batches = splitInventory(
      inventory(
        [
          entry('n1'),
          entry('b2', { skill: 'b', capturedAt: '2026-10-02T00:00:00Z' }),
          entry('a1', { skill: 'a' }),
          entry('b1', { skill: 'b' }),
        ],
        [entry('d1', { skill: 'a', capturedAt: '2026-10-03T00:00:00Z', deferredAt: '2026-10-20T00:00:00Z' })],
      ),
      2,
    );
    expect(batches.map((batch) => [...batch.pool, ...batch.deferred].map((item) => item.id))).toEqual([
      ['a1', 'd1'],
      ['b1', 'b2'],
      ['n1'],
    ]);
    expect(batches[0]?.deferred.map((item) => item.id)).toEqual(['d1']);
  });
});

describe(buildLessonInventory, () => {
  const first: ClusteredBatch = {
    name: '01',
    inventory: inventory([entry('e1'), entry('e2', { capturedAt: '2026-10-09T00:00:00Z' })]),
    map: { clusters: [{ id: 'x', lesson: 'Lesson X', eventIds: ['e1', 'e2'] }] },
  };
  const second: ClusteredBatch = {
    name: '02',
    inventory: inventory([entry('e3')]),
    map: { clusters: [{ id: 'x', lesson: 'Lesson X again', eventIds: ['e3'] }] },
  };
  const batches = [first, second];

  it('lists each batch cluster under a batch-qualified id', () => {
    const result = buildLessonInventory(batches);
    expect(result).toEqual({
      ok: true,
      lessons: {
        store: 'fixture',
        pool: [
          { id: '01/x', summary: 'Lesson X', capturedAt: '2026-10-09T00:00:00Z', excerpt: 'Summary e1 / Summary e2' },
          { id: '02/x', summary: 'Lesson X again', capturedAt: '2026-10-01T00:00:00Z', excerpt: 'Summary e3' },
        ],
        deferred: [],
        skipped: [],
      },
    });
  });

  it('reports the violations of every batch map, naming the batch', () => {
    const broken: ClusteredBatch[] = [
      { ...first, map: { clusters: [{ id: 'x', lesson: 'L', eventIds: ['e1'] }] } },
      { ...second, map: { clusters: [] } },
    ];
    const result = buildLessonInventory(broken);
    expect(result.ok ? [] : result.violations.map((violation) => [violation.batch, violation.code])).toEqual([
      ['01', 'missing-event'],
      ['02', 'missing-event'],
    ]);
  });

  it('expands a merge map into events', () => {
    expect(combineMaps(batches, { clusters: [{ id: 'x', lesson: 'Lesson X', eventIds: ['01/x', '02/x'] }] })).toEqual({
      clusters: [{ id: 'x', lesson: 'Lesson X', eventIds: ['e1', 'e2', 'e3'] }],
    });
  });
});
