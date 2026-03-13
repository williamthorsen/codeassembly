import { AnimationStrategy } from 'excalibur';

// Sprite sheet grid layout
export const SPRITE_SIZE = 32;
export const GRID_COLUMNS = 4;
export const GRID_ROWS = 3;

// Frame coordinates reference positions in a 4-column x 3-row sprite sheet.
// Row 0 (y=0): idle frames (cols 0-1), walking frame (col 2), resting frame 1 (col 3).
// Row 1 (y=1): working frames (cols 0-2), resting frame 2 (col 3).
// Row 2 (y=2): celebrating frames (cols 0-1), concerned frame (col 2), resting frame 3 (col 3).
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

export const RESTING_FRAME_COORDINATES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 3, y: 0 },
  { x: 3, y: 1 },
  { x: 3, y: 2 },
];

// Duration per frame in milliseconds
export const IDLE_DURATION = 600;
export const WALKING_DURATION = 200;
export const WORKING_DURATION = 300;
export const CELEBRATING_DURATION = 500;
export const CONCERNED_DURATION = 600;
export const RESTING_DURATION = 500;

// Animation playback strategies
export const IDLE_STRATEGY = AnimationStrategy.PingPong;
export const WALKING_STRATEGY = AnimationStrategy.Loop;
export const WORKING_STRATEGY = AnimationStrategy.Loop;
export const CELEBRATING_STRATEGY = AnimationStrategy.PingPong;
export const CONCERNED_STRATEGY = AnimationStrategy.Freeze;
export const RESTING_STRATEGY = AnimationStrategy.PingPong;

// ── Orchestrator-specific frame coordinates ──
// The orchestrator uses a different sprite sheet layout than subagents.
// Row 0: idle 1 (0,0), idle 2 (1,0), concerned (2,0), spare (3,0)
// Row 1: working 1 (0,1), working 2 (1,1), walking 1 (2,1), walking 2 (3,1)
// Row 2: celebrating 1 (0,2), celebrating 2 (1,2), spare (2,2), spare (3,2)

export const ORCH_IDLE_FRAME_COORDINATES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
];

export const ORCH_WORKING_FRAME_COORDINATES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

export const ORCH_WALKING_FRAME_COORDINATES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 2, y: 1 },
  { x: 3, y: 1 },
];

export const ORCH_CELEBRATING_FRAME_COORDINATES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 2 },
  { x: 1, y: 2 },
];

export const ORCH_CONCERNED_FRAME_COORDINATES: ReadonlyArray<{ x: number; y: number }> = [{ x: 2, y: 0 }];

// Orchestrator timing (per frame)
export const ORCH_IDLE_DURATION = 1200;
export const ORCH_WORKING_DURATION = 500;
export const ORCH_WALKING_DURATION = 300;
export const ORCH_CELEBRATING_DURATION = 250;
export const ORCH_CONCERNED_DURATION = 600;

// Orchestrator strategies
export const ORCH_IDLE_STRATEGY = AnimationStrategy.PingPong;
export const ORCH_WORKING_STRATEGY = AnimationStrategy.Loop;
export const ORCH_WALKING_STRATEGY = AnimationStrategy.Loop;
export const ORCH_CELEBRATING_STRATEGY = AnimationStrategy.Loop;
export const ORCH_CONCERNED_STRATEGY = AnimationStrategy.Freeze;
