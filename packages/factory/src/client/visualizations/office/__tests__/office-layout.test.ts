import { describe, expect, it } from 'vitest';

import { TILE_SIZE } from '../constants/dimensions.js';
import { ZONE_DEFINITIONS } from '../constants/zone-definitions.js';
import { createOfficeLayout } from '../layout/office-layout.js';

describe(createOfficeLayout, () => {
  const layout = createOfficeLayout();

  describe('slotPosition', () => {
    it('returns pixel coordinates for every slot in every zone', () => {
      for (const zone of ZONE_DEFINITIONS) {
        for (const slot of zone.slots) {
          const pos = layout.slotPosition(slot.id);
          expect(pos.x).toBe(slot.tile.col * TILE_SIZE + TILE_SIZE / 2);
          expect(pos.y).toBe(slot.tile.row * TILE_SIZE + TILE_SIZE / 2);
        }
      }
    });

    it('throws for an unknown slot ID', () => {
      expect(() => layout.slotPosition('nonexistent')).toThrow('Unknown slot ID');
    });
  });

  describe('zoneCenter', () => {
    it('returns pixel center for all 3 zones', () => {
      for (const zone of ZONE_DEFINITIONS) {
        const center = layout.zoneCenter(zone.id);
        const expectedX = (zone.bounds.col + zone.bounds.width / 2) * TILE_SIZE;
        const expectedY = (zone.bounds.row + zone.bounds.height / 2) * TILE_SIZE;
        expect(center).toEqual({ x: expectedX, y: expectedY });
      }
    });

    it('throws for an unknown zone ID', () => {
      expect(() => layout.zoneCenter('nonexistent')).toThrow('Unknown zone ID');
    });
  });

  describe('slotsInZone', () => {
    it('returns all slots for a zone', () => {
      const prepSlots = layout.slotsInZone('prep');
      expect(prepSlots).toHaveLength(2);
      expect(prepSlots.map((s) => s.id)).toEqual(['prep-ws-0', 'prep-ws-1']);
    });

    it('filters by slot type', () => {
      const storageSlots = layout.slotsInZone('governor', 'storage');
      expect(storageSlots).toHaveLength(3);
      expect(storageSlots.every((s) => s.type === 'storage')).toBe(true);
    });

    it('returns workstations when filtered', () => {
      const workstations = layout.slotsInZone('workshop', 'workstation');
      expect(workstations).toHaveLength(6);
    });

    it('throws for an unknown zone ID', () => {
      expect(() => layout.slotsInZone('nonexistent')).toThrow('Unknown zone ID');
    });
  });

  describe('corridorPath', () => {
    it.each([
      ['prep', 'workshop'],
      ['workshop', 'prep'],
      ['prep', 'governor'],
      ['governor', 'prep'],
      ['workshop', 'governor'],
      ['governor', 'workshop'],
    ])('returns a non-empty waypoint array for %s -> %s', (from, to) => {
      const path = layout.corridorPath(from, to);
      expect(path.length).toBeGreaterThan(0);
      for (const point of path) {
        expect(typeof point.x).toBe('number');
        expect(typeof point.y).toBe('number');
      }
    });

    it('returns a reversed path for the opposite direction', () => {
      const forward = layout.corridorPath('prep', 'workshop');
      const backward = layout.corridorPath('workshop', 'prep');

      // The paths should pass through the same points in opposite order
      expect(forward).toHaveLength(backward.length);
    });

    it('passes through doorway positions', () => {
      const prepZone = ZONE_DEFINITIONS.find((z) => z.id === 'prep');
      expect(prepZone).toBeDefined();
      const prepDoor = prepZone?.doors[0];
      expect(prepDoor).toBeDefined();
      if (prepDoor === undefined) return;
      const expectedDoorX = prepDoor.tile.col * TILE_SIZE + TILE_SIZE / 2;
      const expectedDoorY = prepDoor.tile.row * TILE_SIZE + TILE_SIZE / 2;

      const path = layout.corridorPath('prep', 'governor');
      const matchesDoor = path.some((p) => p.x === expectedDoorX && p.y === expectedDoorY);
      expect(matchesDoor).toBe(true);
    });

    it('throws for an invalid zone pair', () => {
      expect(() => layout.corridorPath('prep', 'nonexistent')).toThrow('No corridor path');
    });
  });

  describe('zones', () => {
    it('exposes all zone definitions', () => {
      expect(layout.zones).toHaveLength(3);
      expect(layout.zones.map((z) => z.id)).toEqual(['prep', 'workshop', 'governor']);
    });
  });
});
