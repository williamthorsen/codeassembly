import { AnimationStrategy } from 'excalibur';

export type AgentAnimationState = 'idle' | 'working';

// Sprite sheet grid layout
export const SPRITE_SIZE = 32;
export const GRID_COLUMNS = 3;
export const GRID_ROWS = 2;

// Frame coordinates reference positions in a 3-column x 2-row sprite sheet.
// Row 0 (y=0): idle frames. Row 1 (y=1): working frames.
export const IDLE_FRAME_COORDINATES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
];

export const WORKING_FRAME_COORDINATES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 1 },
  { x: 1, y: 1 },
  { x: 2, y: 1 },
];

// Duration per frame in milliseconds
export const IDLE_DURATION = 600;
export const WORKING_DURATION = 300;

// Animation playback strategies
export const IDLE_STRATEGY = AnimationStrategy.PingPong;
export const WORKING_STRATEGY = AnimationStrategy.Loop;
