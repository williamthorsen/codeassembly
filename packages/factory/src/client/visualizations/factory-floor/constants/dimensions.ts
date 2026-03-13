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
export const UPPER_PLATFORM_Y = 140;

/** Y coordinate of the horizontal rail where the orchestrator walks. */
export const RAIL_Y = 300;

/** Y coordinate of the lower platform where Reviewers, Simplifier, and Holistic stand. */
export const LOWER_PLATFORM_Y = 460;

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
export const CODER_X = 480;

/** X position for the Summary destination on the rail. */
export const SUMMARY_X = 640;

// ---------------------------------------------------------------------------
// Lower zone station X positions (dual-anchor)
// ---------------------------------------------------------------------------

/** Left margin for the first reviewer position. */
export const LOWER_LEFT_MARGIN = 100;

/** Gap between reviewer slots. */
export const REVIEWER_SPACING = 100;

/** Fixed X position for the Simplifier station (anchored from right). */
export const SIMPLIFIER_X = 560;

/** Fixed X position for the Holistic station (anchored from right). */
export const HOLISTIC_X = 680;

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

/** Fixed platform width, determined by the rightmost element (Summary + margin). */
export const PLATFORM_WIDTH = SUMMARY_X + LAYOUT_MARGIN;

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export const CAMERA_TOP_MARGIN = 30;

// ---------------------------------------------------------------------------
// Carried artifact sizing
// ---------------------------------------------------------------------------

export const CARRIED_ART_W = 20;
export const CARRIED_ART_H = 10;
export const CARRIED_ART_GAP = 4;
