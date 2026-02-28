import { describe, expect, it } from 'vitest';

import { computeLayout } from '../platform-layout.js';
import { computeWalkPath } from '../walk-path.js';

describe('computeWalkPath', () => {
  it('returns empty array when source equals destination', () => {
    const layout = computeLayout(2);

    const waypoints = computeWalkPath({ x: 100, y: 200 }, { x: 100, y: 200 }, layout);

    expect(waypoints).toEqual([]);
  });

  it('returns single non-teleport waypoint for same-level movement', () => {
    const layout = computeLayout(2);

    const waypoints = computeWalkPath({ x: 100, y: 400 }, { x: 300, y: 400 }, layout);

    expect(waypoints).toEqual([{ x: 300, y: 400, teleport: false }]);
  });

  it('returns 3 waypoints for ascending level change (0 to 1)', () => {
    const layout = computeLayout(2);
    const ladderX = layout.ladders[0]?.x;
    expect(ladderX).toBeDefined();

    const sourceY = 378; // level 0 agent Y
    const destY = 322; // level 1 agent Y

    const waypoints = computeWalkPath({ x: 200, y: sourceY }, { x: 650, y: destY }, layout);

    expect(waypoints).toHaveLength(3);
    expect(waypoints[0]).toEqual({ x: ladderX, y: sourceY, teleport: false });
    expect(waypoints[1]).toEqual({ x: ladderX, y: destY, teleport: true });
    expect(waypoints[2]).toEqual({ x: 650, y: destY, teleport: false });
  });

  it('returns 3 waypoints for descending level change (1 to 0)', () => {
    const layout = computeLayout(2);
    const ladderX = layout.ladders[0]?.x;
    expect(ladderX).toBeDefined();

    const sourceY = 322; // level 1 agent Y
    const destY = 378; // level 0 agent Y

    const waypoints = computeWalkPath({ x: 650, y: sourceY }, { x: 200, y: destY }, layout);

    expect(waypoints).toHaveLength(3);
    expect(waypoints[0]).toEqual({ x: ladderX, y: sourceY, teleport: false });
    expect(waypoints[1]).toEqual({ x: ladderX, y: destY, teleport: true });
    expect(waypoints[2]).toEqual({ x: 200, y: destY, teleport: false });
  });

  it('skips first horizontal segment when source is at ladder X', () => {
    const layout = computeLayout(2);
    const ladderX = layout.ladders[0]?.x;
    expect(ladderX).toBeDefined();

    const sourceY = 378;
    const destY = 322;

    // Source is at the ladder X position
    const waypoints = computeWalkPath({ x: ladderX ?? 0, y: sourceY }, { x: 650, y: destY }, layout);

    expect(waypoints).toHaveLength(2);
    expect(waypoints[0]).toEqual({ x: ladderX, y: destY, teleport: true });
    expect(waypoints[1]).toEqual({ x: 650, y: destY, teleport: false });
  });

  it('skips last horizontal segment when destination is at ladder X', () => {
    const layout = computeLayout(2);
    const ladderX = layout.ladders[0]?.x;
    expect(ladderX).toBeDefined();

    const sourceY = 378;
    const destY = 322;

    // Destination is at the ladder X position
    const waypoints = computeWalkPath({ x: 200, y: sourceY }, { x: ladderX ?? 0, y: destY }, layout);

    expect(waypoints).toHaveLength(2);
    expect(waypoints[0]).toEqual({ x: ladderX, y: sourceY, teleport: false });
    expect(waypoints[1]).toEqual({ x: ladderX, y: destY, teleport: true });
  });

  it('returns single non-teleport waypoint when layout has no ladders', () => {
    const layout = computeLayout(0); // 0 reviewers = no ladders

    const waypoints = computeWalkPath({ x: 100, y: 200 }, { x: 300, y: 400 }, layout);

    expect(waypoints).toEqual([{ x: 300, y: 400, teleport: false }]);
  });
});
