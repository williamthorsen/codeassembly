import type { CharacterName, SingleAssetKey } from './sprite-sheet-urls.js';

// -- Character sprite layout --

/** Number of directional columns in each character idle sprite sheet. */
export const CHARACTER_FRAME_COLS = 4;

/** Number of rows in each character idle sprite sheet. */
export const CHARACTER_FRAME_ROWS = 1;

/** Width of a single character sprite frame in pixels. */
export const CHARACTER_SPRITE_W = 32;

/** Height of a single character sprite frame in pixels (characters are 1x2 tiles). */
export const CHARACTER_SPRITE_H = 64;

/** Column index for the down-facing (camera-facing) direction. */
export const DIR_DOWN = 0;

/** Column index for the left-facing direction. */
export const DIR_LEFT = 1;

/** Column index for the right-facing direction. */
export const DIR_RIGHT = 2;

/** Column index for the up-facing direction. */
export const DIR_UP = 3;

// -- Furniture manifest --

/** A spritesheet region descriptor for multi-tile composites. */
interface SpriteRegion {
  sheet: 'officeSheet';
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** A placeable furniture item with position and sprite source. */
export interface FurnitureItem {
  label: string;
  tx: number;
  ty: number;
  asset?: SingleAssetKey;
  region?: SpriteRegion;
}

/** Static furniture manifest defining all office furnishings and their positions. */
export const FURNITURE_MANIFEST: readonly FurnitureItem[] = [
  // Prep area: wall decor
  { label: 'Analysis board', asset: 'analysisBoard172', tx: 3.56, ty: -1.06 },
  { label: 'Certificate 1', asset: 'certificate113', tx: 7.47, ty: -1.03 },
  { label: 'Diploma', asset: 'diploma116', tx: 8.47, ty: -1.03 },
  // Prep area: furniture
  { label: 'Desk (architect)', asset: 'prepDesk186', tx: 2, ty: 4 },
  { label: 'Lamp (architect)', asset: 'deskLamp141', tx: 2, ty: 3.53 },
  { label: 'Desk (planner)', asset: 'prepDesk186', tx: 5, ty: 5 },
  { label: 'Lamp (planner)', asset: 'deskLamp141', tx: 5, ty: 4.59 },
  { label: 'Plant (prep NW)', asset: 'plant100', tx: 1, ty: 1 },
  { label: 'Plant (prep S)', asset: 'plant100', tx: 10.81, ty: 8.44 },
  // Workshop: coder
  { label: 'Desk (coder)', region: { sheet: 'officeSheet', sx: 32, sy: 1120, sw: 64, sh: 64 }, tx: 17, ty: 7 },
  { label: 'Monitors (coder)', region: { sheet: 'officeSheet', sx: 416, sy: 384, sw: 96, sh: 32 }, tx: 16.5, ty: 6.5 },
  { label: 'Keyboard (coder)', region: { sheet: 'officeSheet', sx: 448, sy: 448, sw: 32, sh: 32 }, tx: 17.5, ty: 7.5 },
  { label: 'Shelf (workshop)', asset: 'modernShelf205', tx: 16.78, ty: 0.88 },
  // Workshop: reviewers
  { label: 'Desk (Bob)', asset: 'workshopDesk183', tx: 27, ty: 4 },
  { label: 'Monitor (Bob)', region: { sheet: 'officeSheet', sx: 448, sy: 320, sw: 32, sh: 64 }, tx: 27.03, ty: 4.25 },
  { label: 'Desk (Ash)', asset: 'workshopDesk183', tx: 30, ty: 5 },
  { label: 'Monitor (Ash)', region: { sheet: 'officeSheet', sx: 448, sy: 320, sw: 32, sh: 64 }, tx: 30, ty: 5.25 },
  { label: 'Desk (Rob)', asset: 'workshopDesk183', tx: 33, ty: 4 },
  { label: 'Monitor (Rob)', region: { sheet: 'officeSheet', sx: 448, sy: 320, sw: 32, sh: 64 }, tx: 33, ty: 4.31 },
  // Workshop: decor
  { label: 'Dashboard', asset: 'dashboard175', tx: 13.34, ty: 1.19 },
  { label: 'Plant (workshop NW)', asset: 'plant100', tx: 15.59, ty: 1.16 },
  { label: 'Plant (workshop S)', asset: 'plant100', tx: 19.06, ty: 0.97 },
  { label: 'Certificate 2', asset: 'certificate114', tx: 23.56, ty: 12.09 },
  { label: 'Chart board', asset: 'chartBoard171', tx: 29.28, ty: 11.91 },
  // Governor's office
  {
    label: 'Orchestrator desk',
    region: { sheet: 'officeSheet', sx: 320, sy: 0, sw: 160, sh: 128 },
    tx: 20.13,
    ty: 16.53,
  },
  { label: 'Exec shelf', asset: 'execShelf206', tx: 32.69, ty: 13.22 },
  { label: 'Plant (governor)', asset: 'plant100', tx: 34, ty: 13 },
] as const;

// -- Character-to-role mapping --

/** Default character assignment pool for reviewer roles, indexed by slot position. */
const REVIEWER_CHARACTERS: readonly CharacterName[] = ['Bob', 'Ash', 'Rob'];

/** Maps workflow phase names to their default character sprite. */
export const CHARACTER_ROLE_MAP: Record<string, CharacterName> = {
  architecture: 'Alex',
  planning: 'Amelia',
  implementation: 'Dan',
  review: 'Bob',
  simplifier: 'Ash',
  holistic: 'Rob',
  orchestrator: 'Adam',
};

/** Resolve the character sprite name for a given phase and agent ID. */
export function resolveCharacterName(phase: string, agentId: string): CharacterName {
  // Reviewer phases use a rotating pool based on agent ID hash
  if (phase === 'review' || phase === 'simplifier' || phase === 'holistic') {
    // Compute a stable index using a djb2-style multiplicative hash for better distribution
    let hash = 5381;
    for (let i = 0; i < agentId.length; i++) {
      hash = Math.trunc(hash * 33 + (agentId.codePointAt(i) ?? 0));
    }
    return REVIEWER_CHARACTERS[Math.abs(hash) % REVIEWER_CHARACTERS.length] ?? 'Adam';
  }

  return CHARACTER_ROLE_MAP[phase] ?? 'Adam';
}
