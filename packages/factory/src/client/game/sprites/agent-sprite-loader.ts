import { Animation, ImageFiltering, ImageSource, SpriteSheet } from 'excalibur';

import type { RoleType } from '../../../shared/constants/role-types.js';
import { ROLE_TYPES } from '../../../shared/constants/role-types.js';
import { generateSpriteSheetSvg } from './generate-placeholder-sprites.js';
import {
  GRID_COLUMNS,
  GRID_ROWS,
  IDLE_DURATION,
  IDLE_FRAME_COORDINATES,
  IDLE_STRATEGY,
  SPRITE_SIZE,
  WORKING_DURATION,
  WORKING_FRAME_COORDINATES,
  WORKING_STRATEGY,
} from './sprite-definitions.js';

const spriteSheetCache = new Map<RoleType, SpriteSheet>();
const idleCache = new Map<RoleType, Animation>();
const workingCache = new Map<RoleType, Animation>();

function getOrCreateSpriteSheet(roleType: RoleType): SpriteSheet {
  const cached = spriteSheetCache.get(roleType);
  if (cached) return cached;

  const svg = generateSpriteSheetSvg(roleType);
  const imageSource = ImageSource.fromSvgString(svg, { filtering: ImageFiltering.Pixel });

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

/** Preload animations for all role types. */
export function loadAllSprites(): void {
  for (const roleType of ROLE_TYPES) {
    getIdleAnimation(roleType);
    getWorkingAnimation(roleType);
  }
}

/** Clear the sprite cache. Useful for tests. */
export function clearSpriteCache(): void {
  spriteSheetCache.clear();
  idleCache.clear();
  workingCache.clear();
}
