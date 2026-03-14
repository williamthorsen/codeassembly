// ---------------------------------------------------------------------------
// Tile and map dimensions
// ---------------------------------------------------------------------------

/** Size of each tile in pixels (LimeZu 32x32 upscaled versions). */
export const TILE_SIZE = 32;

/** Map width in tiles (matches v2 prototype: 30 columns). */
export const MAP_COLS = 30;

/** Map height in tiles (matches v2 prototype: 22 rows). */
export const MAP_ROWS = 22;

/** Map width in pixels. */
export const MAP_WIDTH = MAP_COLS * TILE_SIZE; // 960

/** Map height in pixels. */
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE; // 704

// ---------------------------------------------------------------------------
// Engine viewport dimensions
// ---------------------------------------------------------------------------

export const ENGINE_WIDTH = MAP_WIDTH;
export const ENGINE_HEIGHT = MAP_HEIGHT;

// ---------------------------------------------------------------------------
// Room colors (placeholder rendering)
// ---------------------------------------------------------------------------

/** Background color for the facility floor area. */
export const FLOOR_COLOR = '#2a2a3e';

/** Wall outline color. */
export const WALL_COLOR = '#555577';

/** Room label text color. */
export const LABEL_COLOR = '#ccccdd';

// ---------------------------------------------------------------------------
// Room layout (tile coordinates)
// ---------------------------------------------------------------------------

/**
 * Room definition for placeholder rendering. Coordinates are in tile units.
 * @deprecated Use `RoomDefinition` from `../types.js` and rooms from `../layout/room-definitions.js` instead.
 */
export interface RoomDef {
  id: string;
  label: string;
  tileX: number;
  tileY: number;
  tileW: number;
  tileH: number;
  color: string;
}

/**
 * Predefined facility rooms for placeholder rendering.
 * @deprecated Use `ALL_ROOMS` from `../layout/room-definitions.js` instead. Still used by `TilemapScene.ts`.
 */
export const FACILITY_ROOMS: readonly RoomDef[] = [
  { id: 'control', label: 'Control Room', tileX: 1, tileY: 1, tileW: 5, tileH: 5, color: '#3a3a5e' },
  { id: 'analysis', label: 'Analysis Lab', tileX: 7, tileY: 1, tileW: 6, tileH: 5, color: '#3e3a5a' },
  { id: 'workshop', label: 'Workshop', tileX: 14, tileY: 1, tileW: 5, tileH: 5, color: '#3a4a5e' },
  { id: 'corridor', label: 'Corridor', tileX: 1, tileY: 6, tileW: 18, tileH: 3, color: '#333350' },
  { id: 'review-bay', label: 'Review Bay', tileX: 1, tileY: 9, tileW: 8, tileH: 5, color: '#4a3a5e' },
  { id: 'commons', label: 'Commons', tileX: 10, tileY: 9, tileW: 9, tileH: 5, color: '#3a3a4e' },
] as const;
