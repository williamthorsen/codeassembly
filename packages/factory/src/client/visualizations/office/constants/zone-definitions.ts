import type { ZoneDefinition } from '../types.js';

/**
 * Prep area zone: architecture and planning agents work here.
 * Layout: cols 1-11, rows 0-11 (11w x 12h).
 * Two workstations (architect left, planner right), each facing wall-mounted displays.
 * South door opens onto the transition strip at row 12.
 */
export const PREP_ZONE: ZoneDefinition = {
  id: 'prep',
  label: 'Prep area',
  bounds: { col: 1, row: 0, width: 11, height: 12 },
  slots: [
    { id: 'prep-desk-0', type: 'workstation', tile: { col: 3, row: 5 }, facing: 'up' },
    { id: 'prep-desk-1', type: 'workstation', tile: { col: 8, row: 5 }, facing: 'up' },
    { id: 'prep-standing-0', type: 'standing', tile: { col: 6, row: 12 }, facing: 'up' },
  ],
  doors: [{ tile: { col: 6, row: 12 }, direction: 'down' }],
};

/**
 * Workshop zone: coder and reviewers work here.
 * Layout: cols 13-35, rows 0-11 (23w x 12h).
 * Coder station at left, up to 5 reviewer stations across the middle-right.
 * South door opens onto the transition strip at row 12.
 */
export const WORKSHOP_ZONE: ZoneDefinition = {
  id: 'workshop',
  label: 'The workshop',
  bounds: { col: 13, row: 0, width: 23, height: 12 },
  slots: [
    { id: 'workshop-desk-0', type: 'workstation', tile: { col: 15, row: 5 }, facing: 'up' },
    { id: 'workshop-desk-1', type: 'workstation', tile: { col: 21, row: 7 }, facing: 'down' },
    { id: 'workshop-desk-2', type: 'workstation', tile: { col: 25, row: 7 }, facing: 'down' },
    { id: 'workshop-desk-3', type: 'workstation', tile: { col: 28, row: 7 }, facing: 'down' },
    { id: 'workshop-desk-4', type: 'workstation', tile: { col: 31, row: 7 }, facing: 'down' },
    { id: 'workshop-desk-5', type: 'workstation', tile: { col: 34, row: 7 }, facing: 'down' },
    { id: 'workshop-standing-0', type: 'standing', tile: { col: 25, row: 12 }, facing: 'up' },
  ],
  doors: [{ tile: { col: 25, row: 12 }, direction: 'down' }],
};

/**
 * Governor's office zone: orchestrator home base with delivery surface.
 * Layout: cols 19-35, rows 13-21 (17w x 9h).
 * Orchestrator desk at left, delivery desks at right, control console on north wall.
 * North door opens onto the transition strip at row 12.
 */
export const GOVERNOR_ZONE: ZoneDefinition = {
  id: 'governor',
  label: "Governor's office",
  bounds: { col: 19, row: 13, width: 17, height: 9 },
  slots: [
    { id: 'governor-desk-0', type: 'workstation', tile: { col: 23, row: 18 }, facing: 'down' },
    { id: 'governor-storage-0', type: 'storage', tile: { col: 28, row: 16 } },
    { id: 'governor-storage-1', type: 'storage', tile: { col: 31, row: 16 } },
    { id: 'governor-storage-2', type: 'storage', tile: { col: 34, row: 16 } },
  ],
  doors: [{ tile: { col: 26, row: 13 }, direction: 'up' }],
};

/** All zone definitions for the 3-zone office layout. */
export const ZONE_DEFINITIONS: readonly ZoneDefinition[] = [PREP_ZONE, WORKSHOP_ZONE, GOVERNOR_ZONE];
