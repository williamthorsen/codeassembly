// Canvas dimensions
export const CANVAS_W = 1400;
export const CANVAS_H = 540;

// Engine viewport dimensions (used by both CatwalkScene and CatwalkCanvas)
export const ENGINE_WIDTH = 1200;
export const ENGINE_HEIGHT = 600;

// ---------------------------------------------------------------------------
// Reference surfaces (horizontal lines)
// ---------------------------------------------------------------------------

/** Y coordinate of the gold rail where the orchestrator walks. */
export const RAIL_Y = 100;

/** Y coordinate of the ground line where agents stand. */
export const GROUND_LINE_Y = RAIL_Y + 282; // 382

// Backward-compatible aliases (deprecated -- prefer RAIL_Y and GROUND_LINE_Y)
/** @deprecated Use RAIL_Y */
export const CATWALK_Y = RAIL_Y;
/** @deprecated This value (340) does not match GROUND_LINE_Y (382). Do not use for new code. */
export const GROUND_Y = 340;

// ---------------------------------------------------------------------------
// Agent rendering (upward from GROUND_LINE_Y)
// ---------------------------------------------------------------------------

/** Sprite pixel size (mirrors SPRITE_SIZE from sprite-definitions.ts to avoid excalibur dependency). */
export const SPRITE_SIZE = 32;

/** Height of the colored accent bar beneath each agent sprite. */
export const ACCENT_BAR_H = 4;

// ---------------------------------------------------------------------------
// Chute vertical extent (derived from reference surfaces)
// ---------------------------------------------------------------------------

/** Distance below RAIL_Y where the chute top starts. */
export const CHUTE_TOP_BELOW_RAIL = 48;

/** Distance above the agent sprite top where the chute bottom ends. */
export const CHUTE_BOT_ABOVE_GROUND = 20;

// Backward-compatible derived constants
/** @deprecated Derive from RAIL_Y + CHUTE_TOP_BELOW_RAIL */
export const CHUTE_TOP = RAIL_Y + CHUTE_TOP_BELOW_RAIL; // 148
/** @deprecated Value (320) preserves old geometry and does not match GROUND_LINE_Y-based derivation (326). Do not use for new code. */
export const CHUTE_BOT = GROUND_Y - 20; // kept for backward compatibility; updated in layout

// ---------------------------------------------------------------------------
// Entity sizing
// ---------------------------------------------------------------------------

export const AGENT_RADIUS = 16;
export const ORCH_RADIUS = 16;
export const ART_W = 40;
export const ART_H = 16;
export const GATE_W = 6;

// ---------------------------------------------------------------------------
// Carried artifact sizing (trailing badges behind orchestrator)
// ---------------------------------------------------------------------------

export const CARRIED_ART_W = 20;
export const CARRIED_ART_H = 10;
export const CARRIED_ART_GAP = 4;

// Code badge offset below orchestrator sprite
export const BADGE_OFFSET_Y = 22;

// ---------------------------------------------------------------------------
// Artifact stacking (downward from GROUND_LINE_Y)
// ---------------------------------------------------------------------------

/** Gap between the ground line and the top of the first artifact. */
export const ARTIFACT_TOP_MARGIN = 12;

/** Vertical gap between stacked artifacts. */
export const ARTIFACT_Y_GAP = 4;

// ---------------------------------------------------------------------------
// Input/output separation
// ---------------------------------------------------------------------------

/** Distance from leftmost agent center to divider center. */
export const DIVIDER_LEFT_OF_AGENT = ART_W / 2 + 8; // 28

/** Gap from divider center to input artifact right edge. */
export const INPUT_LEFT_OF_DIVIDER = 8;

/** Divider line width. */
export const DIVIDER_WIDTH = 1;

/** Fixed depth below GROUND_LINE_Y for divider bottom. */
export const DIVIDER_FIXED_DEPTH = 120;

// ---------------------------------------------------------------------------
// Station label
// ---------------------------------------------------------------------------

/** Gap below ground line to station label position. */
export const STATION_LABEL_BELOW_GROUND = 18;

// ---------------------------------------------------------------------------
// Rail extent (symmetric)
// ---------------------------------------------------------------------------

/** Rail extends this far beyond the first and last visible station. */
export const RAIL_OVERSHOOT = 75;

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/** Margin above RAIL_Y where the camera top sits. */
export const CAMERA_TOP_MARGIN = 40;

// ---------------------------------------------------------------------------
// Layout margins
// ---------------------------------------------------------------------------

export const LAYOUT_MARGIN = 100;
export const STATION_GAP = 30;
