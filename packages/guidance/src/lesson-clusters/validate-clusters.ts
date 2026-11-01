import type { ClusterMap, ClusterViolation, Inventory } from './types.ts';

/**
 * Checks that the map places every inventoried event, pool and deferred alike, in exactly one non-empty cluster, and
 * returns every violation found.
 */
export function validateClusters(inventory: Inventory, map: ClusterMap): ClusterViolation[] {
  const known = new Set([...inventory.pool, ...inventory.deferred].map((entry) => entry.id));
  const placed = new Map<string, string>();
  const clusterIds = new Set<string>();
  const violations: ClusterViolation[] = [];

  for (const cluster of map.clusters) {
    if (clusterIds.has(cluster.id)) {
      violations.push({ code: 'duplicate-cluster-id', message: `cluster id "${cluster.id}" is used more than once` });
    }
    clusterIds.add(cluster.id);

    if (cluster.eventIds.length === 0) {
      violations.push({ code: 'empty-cluster', message: `cluster "${cluster.id}" does not contain any events` });
    }
    for (const eventId of cluster.eventIds) {
      if (!known.has(eventId)) {
        violations.push({
          code: 'unknown-event',
          message: `cluster "${cluster.id}" names event "${eventId}", which the inventory does not contain`,
        });
        continue;
      }
      const owner = placed.get(eventId);
      if (owner === undefined) {
        placed.set(eventId, cluster.id);
      } else {
        violations.push({
          code: 'duplicate-event',
          message: `event "${eventId}" is in cluster "${owner}" and in cluster "${cluster.id}"`,
        });
      }
    }
  }

  for (const eventId of known) {
    if (!placed.has(eventId)) {
      violations.push({ code: 'missing-event', message: `event "${eventId}" is not in any cluster` });
    }
  }

  return violations;
}
