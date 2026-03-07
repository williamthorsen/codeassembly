import { Animation, ImageFiltering, ImageSource, SpriteSheet } from 'excalibur';

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
  RESTING_DURATION,
  RESTING_FRAME_COORDINATES,
  RESTING_STRATEGY,
  SPRITE_SIZE,
  WALKING_DURATION,
  WALKING_FRAME_COORDINATES,
  WALKING_STRATEGY,
  WORKING_DURATION,
  WORKING_FRAME_COORDINATES,
  WORKING_STRATEGY,
} from '../../../game/sprites/sprite-definitions.js';
import type { AgentAnimationState } from '../types.js';
import { type CatwalkSpriteType, SPRITE_SHEET_URLS } from './sprite-sheet-urls.js';

const SPRITE_TYPES: readonly CatwalkSpriteType[] = ['subagent', 'orchestrator'];

let animationCache: Map<CatwalkSpriteType, Map<AgentAnimationState, Animation>> | undefined;
let loadPromise: Promise<void> | undefined;

/** Resolves frame coordinates and timing for the given animation state. */
function frameConfigForState(state: AgentAnimationState): {
  frameCoordinates: ReadonlyArray<{ x: number; y: number }>;
  duration: number;
  strategy: import('excalibur').AnimationStrategy;
} {
  switch (state) {
    case 'idle':
      return { frameCoordinates: IDLE_FRAME_COORDINATES, duration: IDLE_DURATION, strategy: IDLE_STRATEGY };
    case 'walking':
      return { frameCoordinates: WALKING_FRAME_COORDINATES, duration: WALKING_DURATION, strategy: WALKING_STRATEGY };
    case 'working':
      return { frameCoordinates: WORKING_FRAME_COORDINATES, duration: WORKING_DURATION, strategy: WORKING_STRATEGY };
    case 'celebrating':
      return {
        frameCoordinates: CELEBRATING_FRAME_COORDINATES,
        duration: CELEBRATING_DURATION,
        strategy: CELEBRATING_STRATEGY,
      };
    case 'concerned':
      return {
        frameCoordinates: CONCERNED_FRAME_COORDINATES,
        duration: CONCERNED_DURATION,
        strategy: CONCERNED_STRATEGY,
      };
    case 'resting':
      return { frameCoordinates: RESTING_FRAME_COORDINATES, duration: RESTING_DURATION, strategy: RESTING_STRATEGY };
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

const ALL_STATES: readonly AgentAnimationState[] = [
  'idle',
  'walking',
  'working',
  'celebrating',
  'concerned',
  'resting',
];

/** Build animation objects for every state from the given sprite sheet. */
function buildAnimationsForSheet(spriteSheet: SpriteSheet): Map<AgentAnimationState, Animation> {
  const map = new Map<AgentAnimationState, Animation>();
  for (const state of ALL_STATES) {
    const { frameCoordinates, duration, strategy } = frameConfigForState(state);
    const animation = Animation.fromSpriteSheetCoordinates({
      spriteSheet,
      frameCoordinates: [...frameCoordinates],
      durationPerFrame: duration,
      strategy,
    });
    map.set(state, animation);
  }
  return map;
}

/** Build sprite sheets and animation objects synchronously, then load image data asynchronously.
 *
 * The animation cache is populated before `await`, so `getAnimation()` is safe to call
 * immediately after invoking this function -- matching the `agent-sprite-loader` pattern
 * where `SpriteSheet.fromImageSource` and animation creation are synchronous operations. */
export function loadAllCatwalkSprites(): Promise<void> {
  if (animationCache !== undefined) return Promise.resolve();
  if (loadPromise !== undefined) return loadPromise;

  const cache = new Map<CatwalkSpriteType, Map<AgentAnimationState, Animation>>();
  const imageSources: ImageSource[] = [];

  for (const spriteType of SPRITE_TYPES) {
    const url = SPRITE_SHEET_URLS[spriteType];
    const imageSource = new ImageSource(url, { filtering: ImageFiltering.Pixel });
    imageSources.push(imageSource);

    const spriteSheet = SpriteSheet.fromImageSource({
      image: imageSource,
      grid: {
        rows: GRID_ROWS,
        columns: GRID_COLUMNS,
        spriteWidth: SPRITE_SIZE,
        spriteHeight: SPRITE_SIZE,
      },
    });

    cache.set(spriteType, buildAnimationsForSheet(spriteSheet));
  }

  // Populate cache synchronously so getAnimation() works immediately
  animationCache = cache;

  loadPromise = loadImageSources(imageSources);
  return loadPromise;
}

/** Return the cached animation for the given sprite type and state. Throws if sprites have not been loaded. */
export function getAnimation(spriteType: CatwalkSpriteType, state: AgentAnimationState): Animation {
  if (animationCache === undefined) {
    throw new Error('Catwalk sprites have not been loaded. Call loadAllCatwalkSprites() first.');
  }

  const stateMap = animationCache.get(spriteType);
  if (stateMap === undefined) {
    throw new Error(`No animations found for sprite type "${spriteType}".`);
  }

  const animation = stateMap.get(state);
  if (animation === undefined) {
    throw new Error(`No animation found for sprite type "${spriteType}" in state "${state}".`);
  }

  return animation;
}

/** Load image data for all image sources. */
async function loadImageSources(imageSources: ImageSource[]): Promise<void> {
  await Promise.all(imageSources.map((source) => source.load()));
}

/** Clear the catwalk sprite cache, allowing sprites to be reloaded. Useful for tests. */
export function clearCatwalkSpriteCache(): void {
  animationCache = undefined;
  loadPromise = undefined;
}
