/**
 * Batched clustering: an inventory too large for one clusterer is split into batches, each batch is clustered on its
 * own, the batch clusters are merged by lesson in a second pass, and the merge is expanded back into one event map.
 */
import { buildExcerpt } from './inventory.ts';
import type { ClusterMap, ClusterViolation, Inventory, InventoryEntry } from './types.ts';
import { validateClusters } from './validate-clusters.ts';

/** The most events that one clusterer receives when the skill does not set another size. */
export const DEFAULT_BATCH_SIZE = 150;

/** One batch's inventory and the map that its clusterer returned. */
export interface ClusteredBatch {
  name: string;
  inventory: Inventory;
  map: ClusterMap;
}

/**
 * Splits the inventory into batches of at most `size` events. Events are ordered by `skill`, with the events that do
 * not have one last, then by capture time, so that the events that most likely share a lesson land in one batch.
 */
export function splitInventory(inventory: Inventory, size: number): Inventory[] {
  const entries = [...inventory.pool, ...inventory.deferred].toSorted(compareForBatching);
  const batches: Inventory[] = [];
  for (let start = 0; start < entries.length; start += size) {
    const chunk = entries.slice(start, start + size);
    batches.push({
      store: inventory.store,
      pool: chunk.filter((entry) => entry.deferredAt === undefined),
      deferred: chunk.filter((entry) => entry.deferredAt !== undefined),
      skipped: [],
    });
  }
  return batches;
}

/**
 * Validates each batch's map against its batch and returns the batch clusters as a lesson inventory, in which each
 * entry is one batch cluster: its id prefixed with the batch name, its lesson as the summary, and its members'
 * summaries as the excerpt. Returns every batch's violations instead when any map is invalid.
 */
export function buildLessonInventory(
  batches: readonly ClusteredBatch[],
): { ok: true; lessons: Inventory } | { ok: false; violations: Array<{ batch: string } & ClusterViolation> } {
  const violations = batches.flatMap((batch) =>
    validateClusters(batch.inventory, batch.map).map((violation) => ({ batch: batch.name, ...violation })),
  );
  if (violations.length > 0) {
    return { ok: false, violations };
  }

  const pool: InventoryEntry[] = [];
  for (const batch of batches) {
    const entries = new Map([...batch.inventory.pool, ...batch.inventory.deferred].map((entry) => [entry.id, entry]));
    for (const cluster of batch.map.clusters) {
      const members = cluster.eventIds.flatMap((id) => entries.get(id) ?? []);
      const latest =
        members
          .map((member) => member.capturedAt)
          .toSorted()
          .at(-1) ?? '';
      pool.push({
        id: `${batch.name}/${cluster.id}`,
        summary: cluster.lesson,
        capturedAt: latest,
        excerpt: buildExcerpt(members.map((member) => member.summary).join(' / ')),
      });
    }
  }
  return { ok: true, lessons: { store: batches[0]?.inventory.store ?? '', pool, deferred: [], skipped: [] } };
}

/**
 * Expands the merge map, whose members are batch clusters, into one map whose members are events. The caller
 * validates the merge map against the lesson inventory first.
 */
export function combineMaps(batches: readonly ClusteredBatch[], mergeMap: ClusterMap): ClusterMap {
  const eventsByLesson = new Map<string, string[]>();
  for (const batch of batches) {
    for (const cluster of batch.map.clusters) {
      eventsByLesson.set(`${batch.name}/${cluster.id}`, cluster.eventIds);
    }
  }
  return {
    clusters: mergeMap.clusters.map((cluster) => ({
      id: cluster.id,
      lesson: cluster.lesson,
      eventIds: cluster.eventIds.flatMap((lessonId) => eventsByLesson.get(lessonId) ?? []),
    })),
  };
}

// region | Helpers

/** Orders entries by skill, with the entries that do not have one last, then by capture time. */
function compareForBatching(a: InventoryEntry, b: InventoryEntry): number {
  if (a.skill !== b.skill) {
    if (a.skill === undefined) return 1;
    if (b.skill === undefined) return -1;
    return a.skill.localeCompare(b.skill);
  }
  return a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id);
}

// endregion | Helpers
