import { describe, expect, it } from 'vitest';

import { GOVERNOR_ZONE, PREP_ZONE, WORKSHOP_ZONE, ZONE_DEFINITIONS } from '../constants/zone-definitions.js';
import type { TileRect } from '../types.js';

describe('ZONE_DEFINITIONS', () => {
  it('contains exactly 3 zones', () => {
    expect(ZONE_DEFINITIONS).toHaveLength(3);
  });

  it('includes prep, workshop, and governor zones', () => {
    const ids = ZONE_DEFINITIONS.map((z) => z.id);
    expect(ids).toEqual(['prep', 'workshop', 'governor']);
  });

  // Display slots (prep-display-0, workshop-display-0, governor-display-0) are deferred.
  // Counts reflect workstation and storage slots only.
  it('has the expected number of slots per zone', () => {
    expect(PREP_ZONE.slots).toHaveLength(2);
    expect(WORKSHOP_ZONE.slots).toHaveLength(6);
    expect(GOVERNOR_ZONE.slots).toHaveLength(4);
  });

  it('has globally unique slot IDs across all zones', () => {
    const allSlotIds = ZONE_DEFINITIONS.flatMap((z) => z.slots.map((s) => s.id));
    const uniqueIds = new Set(allSlotIds);
    expect(uniqueIds.size).toBe(allSlotIds.length);
  });

  it('has at least one door per zone', () => {
    for (const zone of ZONE_DEFINITIONS) {
      expect(zone.doors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('has non-overlapping zone bounds', () => {
    const zones = [...ZONE_DEFINITIONS];

    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i];
        const b = zones[j];
        if (a === undefined || b === undefined) {
          throw new Error(`Zone at index ${i} or ${j} is undefined`);
        }
        expect(boundsOverlap(a.bounds, b.bounds)).toBe(false);
      }
    }
  });
});

/** Check whether two tile-space rectangles overlap. */
function boundsOverlap(a: TileRect, b: TileRect): boolean {
  const aRight = a.col + a.width;
  const aBottom = a.row + a.height;
  const bRight = b.col + b.width;
  const bBottom = b.row + b.height;

  return a.col < bRight && aRight > b.col && a.row < bBottom && aBottom > b.row;
}
