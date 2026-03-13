import type { Zone } from '../types.js';

// ---------------------------------------------------------------------------
// Canvas / engine dimensions (4:3 aspect ratio)
// ---------------------------------------------------------------------------

export const ENGINE_WIDTH = 800;
export const ENGINE_HEIGHT = 600;

// ---------------------------------------------------------------------------
// Zone Y positions
// ---------------------------------------------------------------------------

/** Y coordinate of the upper platform where Architect and Planner stand. */
export const UPPER_PLATFORM_Y = 110;

/** Y coordinate of the horizontal rail where the orchestrator walks. */
export const RAIL_Y = 205;

/** Y coordinate of the lower platform where Reviewers, Simplifier, and Holistic stand. */
export const LOWER_PLATFORM_Y = 365;

// ---------------------------------------------------------------------------
// Zone assignment by station index
// ---------------------------------------------------------------------------

/**
 * Maps station indices to their vertical zone:
 * 0 Architect -> upper, 1 Planner -> upper,
 * 2 Coder -> rail, 6 Summary -> rail,
 * 3 Review -> lower, 4 Simplifier -> lower, 5 Holistic -> lower.
 */
export const STATION_ZONE: Record<number, Zone> = {
  0: 'upper',
  1: 'upper',
  2: 'rail',
  3: 'lower',
  4: 'lower',
  5: 'lower',
  6: 'rail',
};

// ---------------------------------------------------------------------------
// Sprite sizing (shared with catwalk)
// ---------------------------------------------------------------------------

export const SPRITE_SIZE = 32;
export const ACCENT_BAR_H = 4;
export const SUBAGENT_SPRITE_BOTTOM_PADDING_PX = 1;

// ---------------------------------------------------------------------------
// Layout margins and spacing
// ---------------------------------------------------------------------------

export const LAYOUT_MARGIN = 80;
export const AGENT_RADIUS = 16;
export const AGENT_SPACING = AGENT_RADIUS * 2 + 20;

// ---------------------------------------------------------------------------
// Upper zone station X positions
// ---------------------------------------------------------------------------

/** Left margin to the first upper-zone station center. */
export const UPPER_LEFT_MARGIN = 150;

/** Gap between upper-zone stations (Architect -> Planner). */
export const UPPER_STATION_GAP = 180;

// ---------------------------------------------------------------------------
// Rail zone station X positions
// ---------------------------------------------------------------------------

/** X position for the Coder station on the rail. */
export const CODER_X = 590;

// ---------------------------------------------------------------------------
// Room geometry
// ---------------------------------------------------------------------------

/** Width of the coder's work area. */
export const CODER_ROOM_WIDTH = 100;

/** Width of the orchestrator's work area (half of coder). */
export const ORCH_ROOM_WIDTH = 50;

/** Left edge of the coder room. */
export const CODER_ROOM_LEFT = CODER_X - CODER_ROOM_WIDTH / 2;

/** Right edge of the coder room (= left edge of orchestrator room). */
export const CODER_ROOM_RIGHT = CODER_X + CODER_ROOM_WIDTH / 2;

/** Left edge of the orchestrator room. */
export const ORCH_ROOM_LEFT = CODER_ROOM_RIGHT;

/** Right edge of the orchestrator room. */
export const ORCH_ROOM_RIGHT = ORCH_ROOM_LEFT + ORCH_ROOM_WIDTH;

/** X position for the Summary destination (center of orchestrator room). */
export const SUMMARY_X = ORCH_ROOM_LEFT + ORCH_ROOM_WIDTH / 2;

// ---------------------------------------------------------------------------
// Lower zone spacing
// ---------------------------------------------------------------------------

/** Left margin for the first lower-zone agent position. */
export const LOWER_LEFT_MARGIN = 100;

/** Preferred gap between lower-zone agents (reviewers, simplifier, holistic). */
export const LOWER_AGENT_SPACING = 80;

/** Gap between the last lower-zone agent and the coder room left edge. */
export const LOWER_RIGHT_MARGIN = 20;

// ---------------------------------------------------------------------------
// Zone boundary geometry
// ---------------------------------------------------------------------------

/** Symmetric gap from boundary line to agent platforms (both upper and lower). */
export const BOUNDARY_GAP = 30;

// ---------------------------------------------------------------------------
// Chute geometry
// ---------------------------------------------------------------------------

/** Distance below/above RAIL_Y where chute endpoints start/end. */
export const CHUTE_RAIL_OFFSET = 30;

/** Distance from the agent sprite where the chute terminates near the platform. */
export const CHUTE_PLATFORM_OFFSET = 20;

// ---------------------------------------------------------------------------
// Rail extent
// ---------------------------------------------------------------------------

/** Rail extends this far beyond the first and last visible element. */
export const RAIL_OVERSHOOT = 60;

// ---------------------------------------------------------------------------
// Platform width
// ---------------------------------------------------------------------------

/** Fixed platform width; orchestrator room right wall aligns with the rail right endpoint. */
export const PLATFORM_WIDTH = ORCH_ROOM_RIGHT + LAYOUT_MARGIN - RAIL_OVERSHOOT;

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** Gap below accent bar to label top. */
export const LABEL_Y_OFFSET = 4;

// ---------------------------------------------------------------------------
// Carried artifact sizing
// ---------------------------------------------------------------------------

export const CARRIED_ART_W = 20;
export const CARRIED_ART_H = 10;
export const CARRIED_ART_GAP = 4;
