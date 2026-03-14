import type { DoorDefinition, RoomDefinition, SlotDefinition } from '../types.js';

// ---------------------------------------------------------------------------
// Analysis Lab — architect and planner workstations
// ---------------------------------------------------------------------------

/** Analysis Lab: hosts architect and planner at side-by-side workstations. */
export const ANALYSIS_LAB: RoomDefinition = {
  id: 'analysis',
  label: 'Analysis Lab',
  bounds: { x: 1, y: 1, w: 9, h: 7 },
  doors: [{ position: { tileX: 10, tileY: 4 }, side: 'right' }],
  slots: [
    { id: 'analysis-ws-0', position: { tileX: 3, tileY: 5 }, type: 'workstation', facing: 'up' },
    { id: 'analysis-ws-1', position: { tileX: 7, tileY: 5 }, type: 'workstation', facing: 'up' },
    { id: 'analysis-display-0', position: { tileX: 8, tileY: 1 }, type: 'display', facing: 'down' },
  ],
};

// ---------------------------------------------------------------------------
// Control Room — orchestrator workstation
// ---------------------------------------------------------------------------

/** Control Room: orchestrator command center with a single workstation. */
export const CONTROL_ROOM: RoomDefinition = {
  id: 'control',
  label: 'Control Room',
  bounds: { x: 11, y: 1, w: 9, h: 7 },
  doors: [
    { position: { tileX: 11, tileY: 4 }, side: 'left' },
    { position: { tileX: 14, tileY: 8 }, side: 'bottom' },
  ],
  slots: [
    { id: 'control-ws-0', position: { tileX: 15, tileY: 5 }, type: 'workstation', facing: 'down' },
    { id: 'control-display-0', position: { tileX: 13, tileY: 1 }, type: 'display', facing: 'down' },
  ],
};

// ---------------------------------------------------------------------------
// Coder's Workshop — implementation workstation
// ---------------------------------------------------------------------------

/** Coder's Workshop: implementation workstation with a secondary laptop slot. */
export const WORKSHOP: RoomDefinition = {
  id: 'workshop',
  label: "Coder's Workshop",
  bounds: { x: 1, y: 11, w: 9, h: 9 },
  doors: [{ position: { tileX: 10, tileY: 14 }, side: 'right' }],
  slots: [
    { id: 'workshop-ws-0', position: { tileX: 4, tileY: 16 }, type: 'workstation', facing: 'up' },
    { id: 'workshop-ws-1', position: { tileX: 7, tileY: 15 }, type: 'workstation', facing: 'up' },
  ],
};

// ---------------------------------------------------------------------------
// Review Bay — reviewer workstations
// ---------------------------------------------------------------------------

/** Review Bay: hosts multiple reviewer workstations in a row. */
export const REVIEW_BAY: RoomDefinition = {
  id: 'review-bay',
  label: 'Review Bay',
  bounds: { x: 17, y: 11, w: 12, h: 9 },
  doors: [{ position: { tileX: 17, tileY: 14 }, side: 'left' }],
  slots: [
    { id: 'review-ws-0', position: { tileX: 19, tileY: 16 }, type: 'workstation', facing: 'up' },
    { id: 'review-ws-1', position: { tileX: 22, tileY: 16 }, type: 'workstation', facing: 'up' },
    { id: 'review-ws-2', position: { tileX: 25, tileY: 16 }, type: 'workstation', facing: 'up' },
    // Simplifier and holistic reviewer workstations (separate from parallel reviewers)
    { id: 'review-ws-3', position: { tileX: 19, tileY: 13 }, type: 'workstation', facing: 'down' },
    { id: 'review-ws-4', position: { tileX: 22, tileY: 13 }, type: 'workstation', facing: 'down' },
  ],
};

// ---------------------------------------------------------------------------
// Delivery Room — artifact accumulation and status board
// ---------------------------------------------------------------------------

/** Delivery Room: where completed artifacts are gathered and the status board displays. */
export const DELIVERY_ROOM: RoomDefinition = {
  id: 'delivery',
  label: 'Delivery Room',
  bounds: { x: 20, y: 1, w: 9, h: 7 },
  doors: [{ position: { tileX: 20, tileY: 4 }, side: 'left' }],
  slots: [
    { id: 'delivery-display-0', position: { tileX: 24, tileY: 2 }, type: 'display', facing: 'down' },
    { id: 'delivery-gathering-0', position: { tileX: 23, tileY: 5 }, type: 'gathering', facing: 'up' },
    { id: 'delivery-gathering-1', position: { tileX: 25, tileY: 5 }, type: 'gathering', facing: 'up' },
  ],
};

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

/** All rooms in the facility, ordered from top-left to bottom-right. */
export const ALL_ROOMS: readonly RoomDefinition[] = [ANALYSIS_LAB, CONTROL_ROOM, DELIVERY_ROOM, WORKSHOP, REVIEW_BAY];

/** Lookup a room definition by its ID. Returns `undefined` if not found. */
export function findRoomById(roomId: string): RoomDefinition | undefined {
  return ALL_ROOMS.find((r) => r.id === roomId);
}

/** Lookup a slot definition across all rooms by slot ID. Returns the slot and its parent room. */
export function findSlotById(slotId: string): { room: RoomDefinition; slot: SlotDefinition } | undefined {
  for (const room of ALL_ROOMS) {
    const slot = room.slots.find((s) => s.id === slotId);
    if (slot !== undefined) {
      return { room, slot };
    }
  }
  return undefined;
}

/** Lookup a door definition across all rooms by position. */
export function findDoorByPosition(
  tileX: number,
  tileY: number,
): { room: RoomDefinition; door: DoorDefinition } | undefined {
  for (const room of ALL_ROOMS) {
    const door = room.doors.find((d) => d.position.tileX === tileX && d.position.tileY === tileY);
    if (door !== undefined) {
      return { room, door };
    }
  }
  return undefined;
}
