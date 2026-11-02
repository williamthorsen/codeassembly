import type { ClusterMap, Inventory } from '../lesson-clusters/types.ts';
import type { Assignment } from './schemas.ts';
import type { Pin, ReferenceEntry } from './types.ts';

/** The most events in one judge's assignment when `--group-size` does not set another. */
export const DEFAULT_GROUP_SIZE = 60;

/**
 * Packs the map's clusters, in map order, into judge assignments of at most `groupSize` events, starting a new group
 * when the next cluster would exceed the size. A cluster larger than the size forms a group of its own. The map must
 * already be valid against the inventory.
 */
export function buildAssignments(input: {
  inventory: Inventory;
  map: ClusterMap;
  references: readonly ReferenceEntry[];
  pins: readonly Pin[];
  groupSize: number;
}): Assignment[] {
  const entries = new Map([...input.inventory.pool, ...input.inventory.deferred].map((entry) => [entry.id, entry]));
  const groups: Array<Assignment['clusters']> = [];
  let current: Assignment['clusters'] = [];
  let currentSize = 0;

  for (const cluster of input.map.clusters) {
    if (current.length > 0 && currentSize + cluster.eventIds.length > input.groupSize) {
      groups.push(current);
      current = [];
      currentSize = 0;
    }
    current.push({
      id: cluster.id,
      lesson: cluster.lesson,
      events: cluster.eventIds.map((id) => projectEvent(id, entries)),
    });
    currentSize += cluster.eventIds.length;
  }
  if (current.length > 0) groups.push(current);

  return groups.map((clusters) => ({
    store: input.inventory.store,
    clusters,
    references: [...input.references],
    pins: [...input.pins],
  }));
}

/** Returns the two-digit sequence number that names the `index`th assignment and its bins file. */
export function formatSequence(index: number): string {
  return String(index + 1).padStart(2, '0');
}

// region | Helpers

/** Projects an inventory entry onto the fields that a judge reads. */
function projectEvent(
  id: string,
  entries: ReadonlyMap<string, Inventory['pool'][number]>,
): Assignment['clusters'][number]['events'][number] {
  const entry = entries.get(id);
  if (entry === undefined) throw new Error(`event ${id} is not in the inventory`);
  return {
    id,
    summary: entry.summary,
    excerpt: entry.excerpt,
    ...(entry.skill !== undefined && { skill: entry.skill }),
    ...(entry.deferredAt !== undefined && { deferredAt: entry.deferredAt }),
  };
}

// endregion | Helpers
