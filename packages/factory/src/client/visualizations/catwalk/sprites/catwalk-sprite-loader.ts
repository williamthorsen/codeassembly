import { Animation, ImageFiltering, ImageSource, SpriteSheet } from 'excalibur';

import type { AgentAnimationState } from '../types.js';
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
  ORCH_CELEBRATING_DURATION,
  ORCH_CELEBRATING_FRAME_COORDINATES,
  ORCH_CELEBRATING_STRATEGY,
  ORCH_CONCERNED_DURATION,
  ORCH_CONCERNED_FRAME_COORDINATES,
  ORCH_CONCERNED_STRATEGY,
  ORCH_IDLE_DURATION,
  ORCH_IDLE_FRAME_COORDINATES,
  ORCH_IDLE_STRATEGY,
  ORCH_WALKING_DURATION,
  ORCH_WALKING_FRAME_COORDINATES,
  ORCH_WALKING_STRATEGY,
  ORCH_WORKING_DURATION,
  ORCH_WORKING_FRAME_COORDINATES,
  ORCH_WORKING_STRATEGY,
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
} from './sprite-definitions.js';
import { type CatwalkSpriteType, SPRITE_SHEET_URLS } from './sprite-sheet-urls.js';

const SPRITE_TYPES: readonly CatwalkSpriteType[] = ['subagent', 'orchestrator'];

let animationCache: Map<CatwalkSpriteType, Map<AgentAnimationState, Animation>> | undefined;

interface FrameConfig {
  frameCoordinates: ReadonlyArray<{ x: number; y: number }>;
  durationMs: number;
  strategy: import('excalibur').AnimationStrategy;
}

/** Resolves frame coordinates and timing for orchestrator sprite states. */
function orchestratorFrameConfig(state: AgentAnimationState): FrameConfig {
  switch (state) {
    case 'idle':
      return {
        frameCoordinates: ORCH_IDLE_FRAME_COORDINATES,
        durationMs: ORCH_IDLE_DURATION,
        strategy: ORCH_IDLE_STRATEGY,
      };
    case 'walking':
      return {
        frameCoordinates: ORCH_WALKING_FRAME_COORDINATES,
        durationMs: ORCH_WALKING_DURATION,
        strategy: ORCH_WALKING_STRATEGY,
      };
    case 'working':
      return {
        frameCoordinates: ORCH_WORKING_FRAME_COORDINATES,
        durationMs: ORCH_WORKING_DURATION,
        strategy: ORCH_WORKING_STRATEGY,
      };
    case 'celebrating':
      return {
        frameCoordinates: ORCH_CELEBRATING_FRAME_COORDINATES,
        durationMs: ORCH_CELEBRATING_DURATION,
        strategy: ORCH_CELEBRATING_STRATEGY,
      };
    case 'concerned':
      return {
        frameCoordinates: ORCH_CONCERNED_FRAME_COORDINATES,
        durationMs: ORCH_CONCERNED_DURATION,
        strategy: ORCH_CONCERNED_STRATEGY,
      };
    case 'resting':
      // Orchestrator never enters resting; reuse idle.
      return {
        frameCoordinates: ORCH_IDLE_FRAME_COORDINATES,
        durationMs: ORCH_IDLE_DURATION,
        strategy: ORCH_IDLE_STRATEGY,
      };
    case 'deactivated':
      // Deactivated agents reuse the idle animation; opacity is handled by the actor.
      return {
        frameCoordinates: ORCH_IDLE_FRAME_COORDINATES,
        durationMs: ORCH_IDLE_DURATION,
        strategy: ORCH_IDLE_STRATEGY,
      };
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/** Resolves frame coordinates and timing for subagent sprite states. */
function subagentFrameConfig(state: AgentAnimationState): FrameConfig {
  switch (state) {
    case 'idle':
      return { frameCoordinates: IDLE_FRAME_COORDINATES, durationMs: IDLE_DURATION, strategy: IDLE_STRATEGY };
    case 'walking':
      return { frameCoordinates: WALKING_FRAME_COORDINATES, durationMs: WALKING_DURATION, strategy: WALKING_STRATEGY };
    case 'working':
      return { frameCoordinates: WORKING_FRAME_COORDINATES, durationMs: WORKING_DURATION, strategy: WORKING_STRATEGY };
    case 'celebrating':
      return {
        frameCoordinates: CELEBRATING_FRAME_COORDINATES,
        durationMs: CELEBRATING_DURATION,
        strategy: CELEBRATING_STRATEGY,
      };
    case 'concerned':
      return {
        frameCoordinates: CONCERNED_FRAME_COORDINATES,
        durationMs: CONCERNED_DURATION,
        strategy: CONCERNED_STRATEGY,
      };
    case 'resting':
      return { frameCoordinates: RESTING_FRAME_COORDINATES, durationMs: RESTING_DURATION, strategy: RESTING_STRATEGY };
    case 'deactivated':
      // Deactivated agents reuse the idle animation; opacity is handled by the actor.
      return { frameCoordinates: IDLE_FRAME_COORDINATES, durationMs: IDLE_DURATION, strategy: IDLE_STRATEGY };
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/** Resolves frame coordinates and timing for the given animation state and sprite type. */
function frameConfigForState(state: AgentAnimationState, spriteType: CatwalkSpriteType): FrameConfig {
  if (spriteType === 'orchestrator') {
    return orchestratorFrameConfig(state);
  }
  return subagentFrameConfig(state);
}

const ALL_STATES: readonly AgentAnimationState[] = [
  'idle',
  'walking',
  'working',
  'celebrating',
  'concerned',
  'resting',
  'deactivated',
];

/** Build animation objects for every state from the given sprite sheet. */
function buildAnimationsForSheet(
  spriteSheet: SpriteSheet,
  spriteType: CatwalkSpriteType,
): Map<AgentAnimationState, Animation> {
  const map = new Map<AgentAnimationState, Animation>();
  for (const state of ALL_STATES) {
    const { frameCoordinates, durationMs, strategy } = frameConfigForState(state, spriteType);
    const animation = Animation.fromSpriteSheetCoordinates({
      spriteSheet,
      frameCoordinates: [...frameCoordinates],
      durationPerFrameMs: durationMs,
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
export async function loadAllCatwalkSprites(): Promise<void> {
  if (animationCache !== undefined) return;

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

    cache.set(spriteType, buildAnimationsForSheet(spriteSheet, spriteType));
  }

  // Populate cache synchronously so getAnimation() works immediately.
  // Concurrent callers are deduplicated by the animationCache check above.
  animationCache = cache;

  try {
    await Promise.all(imageSources.map((source) => source.load()));
  } catch (error: unknown) {
    // Reset cache so a subsequent call can retry the load
    animationCache = undefined;
    throw error;
  }
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

/** Clear the catwalk sprite cache, allowing sprites to be reloaded. Useful for tests. */
export function clearCatwalkSpriteCache(): void {
  animationCache = undefined;
}
