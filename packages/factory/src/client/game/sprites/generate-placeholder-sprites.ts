import type { RoleType } from '../../../shared/constants/role-types.js';
import { ROLE_TYPE_COLORS } from '../../../shared/constants/role-types.js';
import { GRID_COLUMNS, GRID_ROWS, SPRITE_SIZE } from './sprite-definitions.js';

const SHEET_WIDTH = SPRITE_SIZE * GRID_COLUMNS;
const SHEET_HEIGHT = SPRITE_SIZE * GRID_ROWS;

// Idle bobbing offsets (row 0, cols 0-1)
const IDLE_Y_OFFSETS = [0, -2];

// Working arm angles in degrees (row 1, cols 0-2)
const WORKING_ARM_ANGLES = [0, 30, -20];

function renderFrame(color: string, col: number, row: number, yOffset: number, armAngle: number): string {
  const ox = col * SPRITE_SIZE;
  const oy = row * SPRITE_SIZE;

  const cx = ox + SPRITE_SIZE / 2;
  const headCy = oy + 10 + yOffset;
  const bodyCy = oy + 22 + yOffset;

  // Arm pivot at shoulder level
  const armStartX = cx;
  const armStartY = bodyCy - 4;
  const armLength = 8;
  const radians = (armAngle * Math.PI) / 180;
  const armEndX = armStartX + armLength * Math.sin(radians);
  const armEndY = armStartY - armLength * Math.cos(radians);

  return [
    `<circle cx="${cx}" cy="${headCy}" r="5" fill="${color}" />`,
    `<rect x="${cx - 4}" y="${bodyCy - 6}" width="8" height="12" fill="${color}" />`,
    `<line x1="${armStartX}" y1="${armStartY}" x2="${armEndX}" y2="${armEndY}" stroke="${color}" stroke-width="2" />`,
  ].join('');
}

/**
 * Generate a placeholder sprite sheet SVG for the given role type.
 * The output is a 96x64 image (3 columns x 2 rows of 32x32 frames).
 * Row 0 contains idle frames; row 1 contains working frames.
 */
export function generateSpriteSheetSvg(roleType: RoleType): string {
  const color = ROLE_TYPE_COLORS[roleType];
  const frames: string[] = [];

  // Row 0: idle frames (cols 0-1)
  for (let col = 0; col < 2; col++) {
    frames.push(renderFrame(color, col, 0, IDLE_Y_OFFSETS[col] ?? 0, 0));
  }

  // Row 1: working frames (cols 0-2)
  for (let col = 0; col < GRID_COLUMNS; col++) {
    frames.push(renderFrame(color, col, 1, 0, WORKING_ARM_ANGLES[col] ?? 0));
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH}" height="${SHEET_HEIGHT}">`,
    ...frames,
    '</svg>',
  ].join('');
}
