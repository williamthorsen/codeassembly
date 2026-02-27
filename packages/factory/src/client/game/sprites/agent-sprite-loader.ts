import { Animation, ImageFiltering, ImageSource, SpriteSheet } from 'excalibur';

import type { RoleType } from '../../../shared/constants/role-types.js';
import { ROLE_TYPES } from '../../../shared/constants/role-types.js';
import { generateSpriteSheetSvg } from './generate-placeholder-sprites.js';
import {
  CELEBRATING_DURATION,
  CELEBRATING_FRAME_COORDINATES,
  CELEBRATING_STRATEGY,
  CONCERNED_DURATION,
  CONCERNED_FRAME_COORDINATES,
  CONCERNED_STRATEGY,
  GRID_COLUMNS,
  GRID_ROWS,
  IDLE_DURATION,
  IDLE_FRAME_COORDINATES,
  IDLE_STRATEGY,
  SPRITE_SIZE,
  WALKING_DURATION,
  WALKING_FRAME_COORDINATES,
  WALKING_STRATEGY,
  WORKING_DURATION,
  WORKING_FRAME_COORDINATES,
  WORKING_STRATEGY,
} from './sprite-definitions.js';

const imageSourceCache = new Map<RoleType, ImageSource>();
const spriteSheetCache = new Map<RoleType, SpriteSheet>();
const idleCache = new Map<RoleType, Animation>();
const walkingCache = new Map<RoleType, Animation>();
const workingCache = new Map<RoleType, Animation>();
const celebratingCache = new Map<RoleType, Animation>();
const concernedCache = new Map<RoleType, Animation>();

function getOrCreateSpriteSheet(roleType: RoleType): SpriteSheet {
  const cached = spriteSheetCache.get(roleType);
  if (cached) return cached;

  const svg = generateSpriteSheetSvg(roleType);
  const imageSource = ImageSource.fromSvgString(svg, { filtering: ImageFiltering.Pixel });
  imageSourceCache.set(roleType, imageSource);

  const spriteSheet = SpriteSheet.fromImageSource({
    image: imageSource,
    grid: {
      rows: GRID_ROWS,
      columns: GRID_COLUMNS,
      spriteWidth: SPRITE_SIZE,
      spriteHeight: SPRITE_SIZE,
    },
  });

  spriteSheetCache.set(roleType, spriteSheet);
  return spriteSheet;
}

/** Return a cached idle animation for the given role type. */
export function getIdleAnimation(roleType: RoleType): Animation {
  const cached = idleCache.get(roleType);
  if (cached) return cached;

  const spriteSheet = getOrCreateSpriteSheet(roleType);
  const animation = Animation.fromSpriteSheetCoordinates({
    spriteSheet,
    // Spread required: Excalibur's type expects a mutable array
    frameCoordinates: [...IDLE_FRAME_COORDINATES],
    durationPerFrame: IDLE_DURATION,
    strategy: IDLE_STRATEGY,
  });

  idleCache.set(roleType, animation);
  return animation;
}

/** Return a cached walking animation for the given role type. */
export function getWalkingAnimation(roleType: RoleType): Animation {
  const cached = walkingCache.get(roleType);
  if (cached) return cached;

  const spriteSheet = getOrCreateSpriteSheet(roleType);
  const animation = Animation.fromSpriteSheetCoordinates({
    spriteSheet,
    // Spread required: Excalibur's type expects a mutable array
    frameCoordinates: [...WALKING_FRAME_COORDINATES],
    durationPerFrame: WALKING_DURATION,
    strategy: WALKING_STRATEGY,
  });

  walkingCache.set(roleType, animation);
  return animation;
}

/** Return a cached working animation for the given role type. */
export function getWorkingAnimation(roleType: RoleType): Animation {
  const cached = workingCache.get(roleType);
  if (cached) return cached;

  const spriteSheet = getOrCreateSpriteSheet(roleType);
  const animation = Animation.fromSpriteSheetCoordinates({
    spriteSheet,
    // Spread required: Excalibur's type expects a mutable array
    frameCoordinates: [...WORKING_FRAME_COORDINATES],
    durationPerFrame: WORKING_DURATION,
    strategy: WORKING_STRATEGY,
  });

  workingCache.set(roleType, animation);
  return animation;
}

/** Return a cached celebrating animation for the given role type. */
export function getCelebratingAnimation(roleType: RoleType): Animation {
  const cached = celebratingCache.get(roleType);
  if (cached) return cached;

  const spriteSheet = getOrCreateSpriteSheet(roleType);
  const animation = Animation.fromSpriteSheetCoordinates({
    spriteSheet,
    // Spread required: Excalibur's type expects a mutable array
    frameCoordinates: [...CELEBRATING_FRAME_COORDINATES],
    durationPerFrame: CELEBRATING_DURATION,
    strategy: CELEBRATING_STRATEGY,
  });

  celebratingCache.set(roleType, animation);
  return animation;
}

/** Return a cached concerned animation for the given role type. */
export function getConcernedAnimation(roleType: RoleType): Animation {
  const cached = concernedCache.get(roleType);
  if (cached) return cached;

  const spriteSheet = getOrCreateSpriteSheet(roleType);
  const animation = Animation.fromSpriteSheetCoordinates({
    spriteSheet,
    // Spread required: Excalibur's type expects a mutable array
    frameCoordinates: [...CONCERNED_FRAME_COORDINATES],
    durationPerFrame: CONCERNED_DURATION,
    strategy: CONCERNED_STRATEGY,
  });

  concernedCache.set(roleType, animation);
  return animation;
}

/** Preload animations for all role types and load their image data. */
export async function loadAllSprites(): Promise<void> {
  for (const roleType of ROLE_TYPES) {
    getIdleAnimation(roleType);
    getWalkingAnimation(roleType);
    getWorkingAnimation(roleType);
    getCelebratingAnimation(roleType);
    getConcernedAnimation(roleType);
  }
  await Promise.all([...imageSourceCache.values()].map((source) => source.load()));
}

/** Clear the sprite cache. Useful for tests. */
export function clearSpriteCache(): void {
  imageSourceCache.clear();
  spriteSheetCache.clear();
  idleCache.clear();
  walkingCache.clear();
  workingCache.clear();
  celebratingCache.clear();
  concernedCache.clear();
}
