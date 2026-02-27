import { AnimationStrategy } from 'excalibur';

export type AgentAnimationState = 'idle' | 'working' | 'walking' | 'celebrating' | 'concerned';

// Sprite sheet grid layout
export const SPRITE_SIZE = 32;
export const GRID_COLUMNS = 3;
export const GRID_ROWS = 3;

// Frame coordinates reference positions in a 3-column x 3-row sprite sheet.
// Row 0 (y=0): idle frames (cols 0-1), walking frame (col 2).
// Row 1 (y=1): working frames (cols 0-2).
// Row 2 (y=2): celebrating frames (cols 0-1), concerned frame (col 2).
export const IDLE_FRAME_COORDINATES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
];

export const WALKING_FRAME_COORDINATES: ReadonlyArray<{ x: number; y: number }> = [{ x: 2, y: 0 }];

export const WORKING_FRAME_COORDINATES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 1 },
  { x: 1, y: 1 },
  { x: 2, y: 1 },
];

export const CELEBRATING_FRAME_COORDINATES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 2 },
  { x: 1, y: 2 },
];

export const CONCERNED_FRAME_COORDINATES: ReadonlyArray<{ x: number; y: number }> = [{ x: 2, y: 2 }];

// Duration per frame in milliseconds
export const IDLE_DURATION = 600;
export const WALKING_DURATION = 200;
export const WORKING_DURATION = 300;
export const CELEBRATING_DURATION = 500;
export const CONCERNED_DURATION = 600;

// Animation playback strategies
export const IDLE_STRATEGY = AnimationStrategy.PingPong;
export const WALKING_STRATEGY = AnimationStrategy.Loop;
export const WORKING_STRATEGY = AnimationStrategy.Loop;
export const CELEBRATING_STRATEGY = AnimationStrategy.PingPong;
export const CONCERNED_STRATEGY = AnimationStrategy.Freeze;
