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

/** Render a walking frame with a side-stepping leg offset. */
function renderWalkingFrame(color: string, col: number, row: number): string {
  const ox = col * SPRITE_SIZE;
  const oy = row * SPRITE_SIZE;
  const cx = ox + SPRITE_SIZE / 2;
  const headCy = oy + 10;
  const bodyCy = oy + 22;

  // Side-step: offset body slightly to the right
  const stepOffset = 3;

  return [
    `<circle cx="${cx + stepOffset}" cy="${headCy}" r="5" fill="${color}" />`,
    `<rect x="${cx + stepOffset - 4}" y="${bodyCy - 6}" width="8" height="12" fill="${color}" />`,
    `<line x1="${cx + stepOffset}" y1="${bodyCy - 4}" x2="${cx + stepOffset}" y2="${bodyCy - 12}" stroke="${color}" stroke-width="2" />`,
  ].join('');
}

/** Render a celebrating frame with arms raised at the given angle. */
function renderCelebratingFrame(color: string, col: number, row: number, armAngle: number): string {
  const ox = col * SPRITE_SIZE;
  const oy = row * SPRITE_SIZE;
  const cx = ox + SPRITE_SIZE / 2;
  const headCy = oy + 8;
  const bodyCy = oy + 20;

  // Raise both arms symmetrically
  const armLength = 8;
  const radians = (armAngle * Math.PI) / 180;
  const leftArmEndX = cx - armLength * Math.sin(radians);
  const leftArmEndY = bodyCy - 4 - armLength * Math.cos(radians);
  const rightArmEndX = cx + armLength * Math.sin(radians);
  const rightArmEndY = bodyCy - 4 - armLength * Math.cos(radians);

  return [
    `<circle cx="${cx}" cy="${headCy}" r="5" fill="${color}" />`,
    `<rect x="${cx - 4}" y="${bodyCy - 6}" width="8" height="12" fill="${color}" />`,
    `<line x1="${cx}" y1="${bodyCy - 4}" x2="${leftArmEndX}" y2="${leftArmEndY}" stroke="${color}" stroke-width="2" />`,
    `<line x1="${cx}" y1="${bodyCy - 4}" x2="${rightArmEndX}" y2="${rightArmEndY}" stroke="${color}" stroke-width="2" />`,
  ].join('');
}

/** Render a concerned frame with hands on head. */
function renderConcernedFrame(color: string, col: number, row: number): string {
  const ox = col * SPRITE_SIZE;
  const oy = row * SPRITE_SIZE;
  const cx = ox + SPRITE_SIZE / 2;
  const headCy = oy + 10;
  const bodyCy = oy + 22;

  // Both arms reach up to the head
  return [
    `<circle cx="${cx}" cy="${headCy}" r="5" fill="${color}" />`,
    `<rect x="${cx - 4}" y="${bodyCy - 6}" width="8" height="12" fill="${color}" />`,
    `<line x1="${cx}" y1="${bodyCy - 4}" x2="${cx - 5}" y2="${headCy}" stroke="${color}" stroke-width="2" />`,
    `<line x1="${cx}" y1="${bodyCy - 4}" x2="${cx + 5}" y2="${headCy}" stroke="${color}" stroke-width="2" />`,
  ].join('');
}

// Celebrating arm angles in degrees (row 2, cols 0-1)
const CELEBRATING_ARM_ANGLES = [45, 60];

// Resting arm angles in degrees (col 3, rows 0-2)
const RESTING_ARM_ANGLES = [45, 80, -45];

/**
 * Generate a placeholder sprite sheet SVG for the given role type.
 * The output is a 128x96 image (4 columns x 3 rows of 32x32 frames).
 * Row 0: idle frames (cols 0-1), walking frame (col 2), resting frame 1 (col 3).
 * Row 1: working frames (cols 0-2), resting frame 2 (col 3).
 * Row 2: celebrating frames (cols 0-1), concerned frame (col 2), resting frame 3 (col 3).
 */
export function generateSpriteSheetSvg(roleType: RoleType): string {
  const color = ROLE_TYPE_COLORS[roleType];
  const frames: string[] = [];

  // Row 0: idle frames (cols 0-1)
  for (const [col, yOffset] of IDLE_Y_OFFSETS.entries()) {
    frames.push(renderFrame(color, col, 0, yOffset, 0));
  }

  // Row 0, col 2: walking frame
  frames.push(renderWalkingFrame(color, 2, 0));

  // Row 1: working frames (cols 0-2)
  for (const [col, WORKING_ARM_ANGLE] of WORKING_ARM_ANGLES.entries()) {
    frames.push(renderFrame(color, col, 1, 0, WORKING_ARM_ANGLE));
  }

  // Row 2: celebrating frames (cols 0-1)
  for (const [col, armAngle] of CELEBRATING_ARM_ANGLES.entries()) {
    frames.push(renderCelebratingFrame(color, col, 2, armAngle));
  }

  // Row 2, col 2: concerned frame
  frames.push(renderConcernedFrame(color, 2, 2));

  // Column 3: resting frames (rows 0-2)
  for (const [row, armAngle] of RESTING_ARM_ANGLES.entries()) {
    frames.push(renderFrame(color, 3, row, 0, armAngle));
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH}" height="${SHEET_HEIGHT}">`,
    ...frames,
    '</svg>',
  ].join('');
}
