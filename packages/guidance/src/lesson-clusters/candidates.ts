import type { SignalledCluster } from './types.ts';

/** How many clusters each signal nominates, as a multiple of the number that a run surfaces. */
export const CANDIDATE_FACTOR = 4;

/**
 * Returns the ids of the clusters that a triage ranks: the union of the top `size` clusters by recurrence, by the count
 * of high and critical ratings, and by latest capture. Each signal nominates on its own, so that one critical event or
 * a recent spike is considered beside the clusters that recur most.
 */
export function selectCandidates(clusters: readonly SignalledCluster[], size: number): Set<string> {
  const rankings: Array<(cluster: SignalledCluster) => number | string> = [
    (cluster) => cluster.signals.recurrence,
    (cluster) => cluster.signals.impact.critical + cluster.signals.impact.high,
    (cluster) => cluster.signals.latestCapturedAt,
  ];
  const selected = new Set<string>();
  for (const rank of rankings) {
    const ranked = clusters
      .filter((cluster) => rank(cluster) !== 0)
      .toSorted((a, b) => compareDescending(rank(a), rank(b)) || a.id.localeCompare(b.id));
    for (const cluster of ranked.slice(0, size)) selected.add(cluster.id);
  }
  return selected;
}

// region | Helpers

/** Compares two signal values so that the larger one sorts first. */
function compareDescending(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return b - a;
  return String(b).localeCompare(String(a));
}

// endregion | Helpers
