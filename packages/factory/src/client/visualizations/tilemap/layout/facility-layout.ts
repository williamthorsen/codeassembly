import { TILE_SIZE } from '../constants/dimensions.js';
import type { FacilityLayout, Position, RoomDefinition, SlotDefinition, SlotType } from '../types.js';
import { ALL_ROOMS } from './room-definitions.js';

// ---------------------------------------------------------------------------
// Corridor junction coordinates (tile units)
// ---------------------------------------------------------------------------
// Horizontal corridor: y:8-10, spanning x:1-28
// Vertical corridor left: x:10, connecting upper/lower rooms
// Vertical corridor right: x:17, connecting control/delivery to review bay

/** Junction outside Analysis Lab right door. */
const ANALYSIS_DOOR = { tileX: 10, tileY: 4 };

/** Junction where the left vertical corridor meets the horizontal corridor. */
const LEFT_JUNCTION = { tileX: 10, tileY: 9 };

/** Junction outside Control Room left door. */
const CONTROL_LEFT_DOOR = { tileX: 11, tileY: 4 };

/** Junction outside Control Room bottom door. */
const CONTROL_BOTTOM_DOOR = { tileX: 14, tileY: 8 };

/** Junction on horizontal corridor at control room column. */
const CONTROL_CORRIDOR = { tileX: 14, tileY: 9 };

/** Junction outside Delivery Room left door. */
const DELIVERY_DOOR = { tileX: 20, tileY: 4 };

/** Junction on horizontal corridor at delivery room column. */
const DELIVERY_CORRIDOR = { tileX: 20, tileY: 9 };

/** Junction where the right vertical corridor meets the horizontal corridor. */
const RIGHT_JUNCTION = { tileX: 17, tileY: 9 };

/** Junction outside Workshop right door. */
const WORKSHOP_DOOR = { tileX: 10, tileY: 14 };

/** Junction outside Review Bay left door. */
const REVIEW_DOOR = { tileX: 17, tileY: 14 };

// ---------------------------------------------------------------------------
// Hardcoded corridor paths (v1: explicit waypoints per room pair)
// ---------------------------------------------------------------------------

interface TilePoint {
  tileX: number;
  tileY: number;
}

/** Tile-coordinate waypoints for navigating between each room pair. */
const CORRIDOR_PATHS: Record<string, TilePoint[]> = {
  // Analysis <-> Control: through shared corridor wall
  'analysis->control': [ANALYSIS_DOOR, CONTROL_LEFT_DOOR],
  'control->analysis': [CONTROL_LEFT_DOOR, ANALYSIS_DOOR],

  // Analysis <-> Workshop: down the left vertical corridor
  'analysis->workshop': [ANALYSIS_DOOR, LEFT_JUNCTION, WORKSHOP_DOOR],
  'workshop->analysis': [WORKSHOP_DOOR, LEFT_JUNCTION, ANALYSIS_DOOR],

  // Analysis <-> Review Bay: left vertical, horizontal, right vertical
  'analysis->review-bay': [ANALYSIS_DOOR, LEFT_JUNCTION, RIGHT_JUNCTION, REVIEW_DOOR],
  'review-bay->analysis': [REVIEW_DOOR, RIGHT_JUNCTION, LEFT_JUNCTION, ANALYSIS_DOOR],

  // Analysis <-> Delivery: through corridor and across
  'analysis->delivery': [ANALYSIS_DOOR, LEFT_JUNCTION, DELIVERY_CORRIDOR, DELIVERY_DOOR],
  'delivery->analysis': [DELIVERY_DOOR, DELIVERY_CORRIDOR, LEFT_JUNCTION, ANALYSIS_DOOR],

  // Control <-> Workshop: bottom door, horizontal, left vertical
  'control->workshop': [CONTROL_BOTTOM_DOOR, CONTROL_CORRIDOR, LEFT_JUNCTION, WORKSHOP_DOOR],
  'workshop->control': [WORKSHOP_DOOR, LEFT_JUNCTION, CONTROL_CORRIDOR, CONTROL_BOTTOM_DOOR],

  // Control <-> Review Bay: bottom door, horizontal, right vertical
  'control->review-bay': [CONTROL_BOTTOM_DOOR, CONTROL_CORRIDOR, RIGHT_JUNCTION, REVIEW_DOOR],
  'review-bay->control': [REVIEW_DOOR, RIGHT_JUNCTION, CONTROL_CORRIDOR, CONTROL_BOTTOM_DOOR],

  // Control <-> Delivery: down to corridor, across, and up
  'control->delivery': [CONTROL_BOTTOM_DOOR, CONTROL_CORRIDOR, DELIVERY_CORRIDOR, DELIVERY_DOOR],
  'delivery->control': [DELIVERY_DOOR, DELIVERY_CORRIDOR, CONTROL_CORRIDOR, CONTROL_BOTTOM_DOOR],

  // Workshop <-> Review Bay: left vertical, horizontal, right vertical
  'workshop->review-bay': [WORKSHOP_DOOR, LEFT_JUNCTION, RIGHT_JUNCTION, REVIEW_DOOR],
  'review-bay->workshop': [REVIEW_DOOR, RIGHT_JUNCTION, LEFT_JUNCTION, WORKSHOP_DOOR],

  // Workshop <-> Delivery: left vertical up, horizontal, up to delivery
  'workshop->delivery': [WORKSHOP_DOOR, LEFT_JUNCTION, DELIVERY_CORRIDOR, DELIVERY_DOOR],
  'delivery->workshop': [DELIVERY_DOOR, DELIVERY_CORRIDOR, LEFT_JUNCTION, WORKSHOP_DOOR],

  // Review Bay <-> Delivery: right vertical up, horizontal, up to delivery
  'review-bay->delivery': [REVIEW_DOOR, RIGHT_JUNCTION, DELIVERY_CORRIDOR, DELIVERY_DOOR],
  'delivery->review-bay': [DELIVERY_DOOR, DELIVERY_CORRIDOR, RIGHT_JUNCTION, REVIEW_DOOR],
};

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/** Create a facility layout with all rooms, slots, and corridor paths. */
export function createFacilityLayout(): FacilityLayout {
  const rooms: Record<string, RoomDefinition> = {};
  const slotIndex = new Map<string, { room: RoomDefinition; slot: SlotDefinition }>();

  for (const room of ALL_ROOMS) {
    rooms[room.id] = room;
    for (const slot of room.slots) {
      slotIndex.set(slot.id, { room, slot });
    }
  }

  return {
    rooms,

    slotPosition(slotId: string): Position {
      const entry = slotIndex.get(slotId);
      if (entry === undefined) {
        throw new Error(`Unknown slot ID: "${slotId}"`);
      }
      return {
        x: entry.slot.position.tileX * TILE_SIZE,
        y: entry.slot.position.tileY * TILE_SIZE,
      };
    },

    roomCenter(roomId: string): Position {
      const room = rooms[roomId];
      if (room === undefined) {
        throw new Error(`Unknown room ID: "${roomId}"`);
      }
      return {
        x: (room.bounds.x + room.bounds.w / 2) * TILE_SIZE,
        y: (room.bounds.y + room.bounds.h / 2) * TILE_SIZE,
      };
    },

    slotsInRoom(roomId: string, type?: SlotType): string[] {
      const room = rooms[roomId];
      if (room === undefined) {
        throw new Error(`Unknown room ID: "${roomId}"`);
      }
      const slots = type === undefined ? room.slots : room.slots.filter((s) => s.type === type);
      return slots.map((s) => s.id);
    },

    corridorPath(fromRoomId: string, toRoomId: string): Position[] {
      if (fromRoomId === toRoomId) {
        return [];
      }

      const key = `${fromRoomId}->${toRoomId}`;
      const waypoints = CORRIDOR_PATHS[key];
      if (waypoints === undefined) {
        throw new Error(`No corridor path defined from "${fromRoomId}" to "${toRoomId}"`);
      }
      return waypoints.map((wp) => ({
        x: wp.tileX * TILE_SIZE,
        y: wp.tileY * TILE_SIZE,
      }));
    },
  };
}
