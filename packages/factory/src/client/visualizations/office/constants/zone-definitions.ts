import type { ZoneDefinition } from '../types.js';

/**
 * Prep area zone: architecture and planning agents work here.
 * Matches prototype tiles: { x: 1, y: 1, w: 11, h: 12 }.
 */
export const PREP_ZONE: ZoneDefinition = {
  id: 'prep',
  label: 'Prep area',
  bounds: { col: 1, row: 1, width: 11, height: 12 },
  slots: [
    { id: 'prep-ws-0', type: 'workstation', tile: { col: 3, row: 5 } },
    { id: 'prep-ws-1', type: 'workstation', tile: { col: 8, row: 5 } },
  ],
  doors: [{ tile: { col: 6, row: 13 }, direction: 'down' }],
};

/**
 * Workshop zone: coder and reviewers work here.
 * Matches prototype tiles: { x: 13, y: 1, w: 26, h: 12 }.
 */
export const WORKSHOP_ZONE: ZoneDefinition = {
  id: 'workshop',
  label: 'The workshop',
  bounds: { col: 13, row: 1, width: 26, height: 12 },
  slots: [
    { id: 'workshop-ws-0', type: 'workstation', tile: { col: 16, row: 5 } },
    { id: 'workshop-ws-1', type: 'workstation', tile: { col: 22, row: 10 } },
    { id: 'workshop-ws-2', type: 'workstation', tile: { col: 25, row: 10 } },
    { id: 'workshop-ws-3', type: 'workstation', tile: { col: 28, row: 10 } },
    { id: 'workshop-ws-4', type: 'workstation', tile: { col: 31, row: 10 } },
    { id: 'workshop-ws-5', type: 'workstation', tile: { col: 34, row: 10 } },
  ],
  doors: [{ tile: { col: 13, row: 7 }, direction: 'left' }],
};

/**
 * Governor's office zone: orchestrator home base with artifact storage.
 * Matches prototype tiles: { x: 1, y: 16, w: 38, h: 13 }.
 */
export const GOVERNOR_ZONE: ZoneDefinition = {
  id: 'governor',
  label: "Governor's office",
  bounds: { col: 1, row: 16, width: 38, height: 13 },
  slots: [
    { id: 'governor-desk-0', type: 'workstation', tile: { col: 5, row: 20 } },
    { id: 'governor-storage-0', type: 'storage', tile: { col: 12, row: 18 } },
    { id: 'governor-storage-1', type: 'storage', tile: { col: 16, row: 18 } },
    { id: 'governor-storage-2', type: 'storage', tile: { col: 20, row: 18 } },
  ],
  doors: [{ tile: { col: 6, row: 16 }, direction: 'up' }],
};

/** All zone definitions for the 3-zone office layout. */
export const ZONE_DEFINITIONS: readonly ZoneDefinition[] = [PREP_ZONE, WORKSHOP_ZONE, GOVERNOR_ZONE];
