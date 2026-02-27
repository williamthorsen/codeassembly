import type { LayoutResult } from './platform-layout.js';

export interface Waypoint {
  x: number;
  y: number;
  teleport: boolean;
}

/**
 * Compute a multi-segment walk path between two positions, using ladders for
 * vertical transitions between levels.
 *
 * - Same level: single walk waypoint to destination.
 * - Different level: walk to ladder X, teleport vertically, walk to destination.
 * - Source equals destination: empty array (no movement needed).
 * - No ladders in layout: fallback to single walk waypoint.
 */
export function computeWalkPath(
  source: { x: number; y: number },
  destination: { x: number; y: number },
  layout: LayoutResult,
): Waypoint[] {
  if (source.x === destination.x && source.y === destination.y) {
    return [];
  }

  // Same level (same Y): direct walk
  if (source.y === destination.y) {
    return [{ x: destination.x, y: destination.y, teleport: false }];
  }

  // Different level: route through the first ladder. Currently only one ladder
  // connects all levels; nearest-ladder selection is a future enhancement.
  const ladder = layout.ladders[0];
  if (ladder === undefined) {
    return [{ x: destination.x, y: destination.y, teleport: false }];
  }

  const waypoints: Waypoint[] = [];

  // 1. Walk horizontally to ladder X (skip if already there)
  if (source.x !== ladder.x) {
    waypoints.push({ x: ladder.x, y: source.y, teleport: false });
  }

  // 2. Teleport vertically to destination Y at ladder X
  waypoints.push({ x: ladder.x, y: destination.y, teleport: true });

  // 3. Walk horizontally to destination X (skip if already there)
  if (ladder.x !== destination.x) {
    waypoints.push({ x: destination.x, y: destination.y, teleport: false });
  }

  return waypoints;
}
