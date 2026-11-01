import { describe, expect, it } from 'vitest';

import type { Inventory } from '../../lesson-clusters/types.ts';
import { buildAssignments } from '../assign.ts';

describe(buildAssignments, () => {
  it('packs whole clusters in map order, starting a group when the next cluster would exceed the size', () => {
    const inventory = makeInventory(['01A', '01B', '01C', '01D', '01E', '01F']);
    const map = {
      clusters: [
        { id: 'one', lesson: 'One.', eventIds: ['01A', '01B'] },
        { id: 'two', lesson: 'Two.', eventIds: ['01C'] },
        { id: 'big', lesson: 'Big.', eventIds: ['01D', '01E', '01F'] },
      ],
    };

    const assignments = buildAssignments({ inventory, map, references: [], pins: [], groupSize: 2 });

    expect(assignments.map((assignment) => assignment.clusters.map((cluster) => cluster.id))).toStrictEqual([
      ['one'],
      ['two'],
      ['big'],
    ]);
  });

  it('carries a deferred event with its deferral time, and the store, references, and pins into every group', () => {
    const inventory = makeInventory(['01A']);
    inventory.deferred.push({
      id: '01B',
      summary: 'B',
      capturedAt: '2026-01-01T00:00:00Z',
      excerpt: 'b',
      deferredAt: '2026-10-01T00:00:00Z',
    });
    const references = [{ id: '01Z', summary: 'Z', excerpt: 'z', references: ['https://example.test/1'] }];

    const [assignment] = buildAssignments({
      inventory,
      map: { clusters: [{ id: 'one', lesson: 'One.', eventIds: ['01A', '01B'] }] },
      references,
      pins: [],
      groupSize: 60,
    });

    expect(assignment?.store).toBe('fixture');
    expect(assignment?.references).toStrictEqual(references);
    expect(assignment?.clusters[0]?.events[1]).toMatchObject({ id: '01B', deferredAt: '2026-10-01T00:00:00Z' });
  });
});

// region | Helpers

/** Builds an inventory whose pool contains one minimal entry per id. */
function makeInventory(ids: readonly string[]): Inventory {
  return {
    store: 'fixture',
    pool: ids.map((id) => ({
      id,
      summary: `Summary ${id}`,
      capturedAt: '2026-01-01T00:00:00Z',
      excerpt: `Excerpt ${id}`,
    })),
    deferred: [],
    skipped: [],
  };
}

// endregion | Helpers
