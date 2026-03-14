import { describe, expect, it } from 'vitest';

import { TILE_SIZE } from '../../constants/dimensions.js';
import { createFacilityLayout } from '../facility-layout.js';
import { ALL_ROOMS } from '../room-definitions.js';

const layout = createFacilityLayout();

describe(createFacilityLayout, () => {
  describe('slot positions', () => {
    it('resolves every slot ID to a valid pixel position', () => {
      for (const room of ALL_ROOMS) {
        for (const slot of room.slots) {
          const pos = layout.slotPosition(slot.id);
          expect(pos.x).toBeGreaterThan(0);
          expect(pos.y).toBeGreaterThan(0);
          expect(Number.isNaN(pos.x)).toBe(false);
          expect(Number.isNaN(pos.y)).toBe(false);
        }
      }
    });

    it('throws for an unknown slot ID', () => {
      expect(() => layout.slotPosition('nonexistent')).toThrow('Unknown slot ID');
    });

    it('places each slot within its room pixel bounds', () => {
      for (const room of ALL_ROOMS) {
        const roomLeft = room.bounds.x * TILE_SIZE;
        const roomTop = room.bounds.y * TILE_SIZE;
        const roomRight = (room.bounds.x + room.bounds.w) * TILE_SIZE;
        const roomBottom = (room.bounds.y + room.bounds.h) * TILE_SIZE;

        for (const slot of room.slots) {
          const pos = layout.slotPosition(slot.id);
          expect(pos.x).toBeGreaterThanOrEqual(roomLeft);
          expect(pos.x).toBeLessThan(roomRight);
          expect(pos.y).toBeGreaterThanOrEqual(roomTop);
          expect(pos.y).toBeLessThan(roomBottom);
        }
      }
    });

    it('assigns unique positions to all workstation slots', () => {
      const positions = new Set<string>();
      for (const room of ALL_ROOMS) {
        for (const slot of room.slots) {
          if (slot.type === 'workstation') {
            const pos = layout.slotPosition(slot.id);
            const key = `${pos.x},${pos.y}`;
            expect(positions.has(key)).toBe(false);
            positions.add(key);
          }
        }
      }
    });
  });

  describe('room center', () => {
    it.each(ALL_ROOMS.map((r) => [r.id, r]))('returns a center within %s bounds', (_id, room) => {
      const center = layout.roomCenter(room.id);
      const roomLeft = room.bounds.x * TILE_SIZE;
      const roomTop = room.bounds.y * TILE_SIZE;
      const roomRight = (room.bounds.x + room.bounds.w) * TILE_SIZE;
      const roomBottom = (room.bounds.y + room.bounds.h) * TILE_SIZE;

      expect(center.x).toBeGreaterThan(roomLeft);
      expect(center.x).toBeLessThan(roomRight);
      expect(center.y).toBeGreaterThan(roomTop);
      expect(center.y).toBeLessThan(roomBottom);
    });

    it('throws for an unknown room ID', () => {
      expect(() => layout.roomCenter('nonexistent')).toThrow('Unknown room ID');
    });
  });

  describe('slots in room', () => {
    it('returns at least one slot for every room', () => {
      for (const room of ALL_ROOMS) {
        const slotIds = layout.slotsInRoom(room.id);
        expect(slotIds.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('returns the correct slot IDs for the analysis lab', () => {
      const slotIds = layout.slotsInRoom('analysis');
      expect(slotIds).toContain('analysis-ws-0');
      expect(slotIds).toContain('analysis-ws-1');
      expect(slotIds).toContain('analysis-display-0');
    });

    it('returns the correct slot IDs for the control room', () => {
      const slotIds = layout.slotsInRoom('control');
      expect(slotIds).toContain('control-ws-0');
      expect(slotIds).toContain('control-display-0');
    });

    it('returns the correct slot IDs for the workshop', () => {
      const slotIds = layout.slotsInRoom('workshop');
      expect(slotIds).toContain('workshop-ws-0');
      expect(slotIds).toContain('workshop-ws-1');
    });

    it('returns the correct slot IDs for the review bay', () => {
      const slotIds = layout.slotsInRoom('review-bay');
      expect(slotIds).toContain('review-ws-0');
      expect(slotIds).toContain('review-ws-1');
      expect(slotIds).toContain('review-ws-2');
    });

    it('returns the correct slot IDs for the delivery room', () => {
      const slotIds = layout.slotsInRoom('delivery');
      expect(slotIds).toContain('delivery-display-0');
      expect(slotIds).toContain('delivery-gathering-0');
      expect(slotIds).toContain('delivery-gathering-1');
    });

    it('filters slots by type', () => {
      const workstations = layout.slotsInRoom('analysis', 'workstation');
      expect(workstations).toEqual(['analysis-ws-0', 'analysis-ws-1']);

      const displays = layout.slotsInRoom('analysis', 'display');
      expect(displays).toEqual(['analysis-display-0']);
    });

    it('returns an empty array when filtering by a type with no matches', () => {
      const storage = layout.slotsInRoom('analysis', 'storage');
      expect(storage).toEqual([]);
    });

    it('throws for an unknown room ID', () => {
      expect(() => layout.slotsInRoom('nonexistent')).toThrow('Unknown room ID');
    });
  });

  describe('corridor path', () => {
    const roomIds = ALL_ROOMS.map((r) => r.id);

    it('returns a non-empty waypoint sequence for every room pair', () => {
      for (const from of roomIds) {
        for (const to of roomIds) {
          if (from === to) continue;
          const path = layout.corridorPath(from, to);
          expect(path.length).toBeGreaterThanOrEqual(2);
          for (const wp of path) {
            expect(wp.x).toBeGreaterThan(0);
            expect(wp.y).toBeGreaterThan(0);
          }
        }
      }
    });

    it('returns an empty array when source and destination are the same room', () => {
      const path = layout.corridorPath('analysis', 'analysis');
      expect(path).toEqual([]);
    });

    it('returns pixel coordinates (multiples of TILE_SIZE)', () => {
      const path = layout.corridorPath('analysis', 'workshop');
      for (const wp of path) {
        expect(wp.x % TILE_SIZE).toBe(0);
        expect(wp.y % TILE_SIZE).toBe(0);
      }
    });
  });

  describe('rooms record', () => {
    it('contains all defined rooms', () => {
      for (const room of ALL_ROOMS) {
        expect(layout.rooms[room.id]).toBeDefined();
      }
    });

    it('has the expected number of rooms', () => {
      expect(Object.keys(layout.rooms).length).toBe(ALL_ROOMS.length);
    });
  });
});
