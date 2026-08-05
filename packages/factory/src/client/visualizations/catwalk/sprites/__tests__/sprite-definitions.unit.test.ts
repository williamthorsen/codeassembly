import { describe, expect, it, vi } from 'vitest';

vi.mock('excalibur', () => ({
  AnimationStrategy: {
    End: 'end',
    Loop: 'loop',
    PingPong: 'pingpong',
    Freeze: 'freeze',
  },
}));

const {
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
  WALKING_DURATION,
  WALKING_FRAME_COORDINATES,
  WALKING_STRATEGY,
  WORKING_DURATION,
  WORKING_FRAME_COORDINATES,
  WORKING_STRATEGY,
} = await import('../sprite-definitions.js');

const { AnimationStrategy } = await import('excalibur');

describe('sprite definitions', () => {
  describe('grid dimensions', () => {
    it('has 4 columns', () => {
      expect(GRID_COLUMNS).toBe(4);
    });

    it('has 3 rows', () => {
      expect(GRID_ROWS).toBe(3);
    });
  });

  describe('idle frame coordinates', () => {
    it('contains coordinates within grid bounds', () => {
      for (const coord of IDLE_FRAME_COORDINATES) {
        expect(coord.x).toBeGreaterThanOrEqual(0);
        expect(coord.x).toBeLessThan(GRID_COLUMNS);
        expect(coord.y).toBeGreaterThanOrEqual(0);
        expect(coord.y).toBeLessThan(GRID_ROWS);
      }
    });

    it('has 2 frames', () => {
      expect(IDLE_FRAME_COORDINATES).toHaveLength(2);
    });
  });

  describe('walking frame coordinates', () => {
    it('contains coordinates within grid bounds', () => {
      for (const coord of WALKING_FRAME_COORDINATES) {
        expect(coord.x).toBeGreaterThanOrEqual(0);
        expect(coord.x).toBeLessThan(GRID_COLUMNS);
        expect(coord.y).toBeGreaterThanOrEqual(0);
        expect(coord.y).toBeLessThan(GRID_ROWS);
      }
    });

    it('has 1 frame', () => {
      expect(WALKING_FRAME_COORDINATES).toHaveLength(1);
    });
  });

  describe('working frame coordinates', () => {
    it('contains coordinates within grid bounds', () => {
      for (const coord of WORKING_FRAME_COORDINATES) {
        expect(coord.x).toBeGreaterThanOrEqual(0);
        expect(coord.x).toBeLessThan(GRID_COLUMNS);
        expect(coord.y).toBeGreaterThanOrEqual(0);
        expect(coord.y).toBeLessThan(GRID_ROWS);
      }
    });

    it('has 3 frames', () => {
      expect(WORKING_FRAME_COORDINATES).toHaveLength(3);
    });
  });

  describe('celebrating frame coordinates', () => {
    it('contains coordinates within grid bounds', () => {
      for (const coord of CELEBRATING_FRAME_COORDINATES) {
        expect(coord.x).toBeGreaterThanOrEqual(0);
        expect(coord.x).toBeLessThan(GRID_COLUMNS);
        expect(coord.y).toBeGreaterThanOrEqual(0);
        expect(coord.y).toBeLessThan(GRID_ROWS);
      }
    });

    it('has 2 frames', () => {
      expect(CELEBRATING_FRAME_COORDINATES).toHaveLength(2);
    });
  });

  describe('concerned frame coordinates', () => {
    it('contains coordinates within grid bounds', () => {
      for (const coord of CONCERNED_FRAME_COORDINATES) {
        expect(coord.x).toBeGreaterThanOrEqual(0);
        expect(coord.x).toBeLessThan(GRID_COLUMNS);
        expect(coord.y).toBeGreaterThanOrEqual(0);
        expect(coord.y).toBeLessThan(GRID_ROWS);
      }
    });

    it('has 1 frame', () => {
      expect(CONCERNED_FRAME_COORDINATES).toHaveLength(1);
    });
  });

  describe('resting frame coordinates', () => {
    it('contains coordinates within grid bounds', () => {
      for (const coord of RESTING_FRAME_COORDINATES) {
        expect(coord.x).toBeGreaterThanOrEqual(0);
        expect(coord.x).toBeLessThan(GRID_COLUMNS);
        expect(coord.y).toBeGreaterThanOrEqual(0);
        expect(coord.y).toBeLessThan(GRID_ROWS);
      }
    });

    it('has 3 frames', () => {
      expect(RESTING_FRAME_COORDINATES).toHaveLength(3);
    });

    it('has a positive duration', () => {
      expect(RESTING_DURATION).toBeGreaterThan(0);
    });

    it('uses PingPong strategy', () => {
      expect(RESTING_STRATEGY).toBe(AnimationStrategy.PingPong);
    });
  });

  describe('duration constants', () => {
    it('has a positive idle duration', () => {
      expect(IDLE_DURATION).toBeGreaterThan(0);
    });

    it('has a positive walking duration', () => {
      expect(WALKING_DURATION).toBeGreaterThan(0);
    });

    it('has a positive working duration', () => {
      expect(WORKING_DURATION).toBeGreaterThan(0);
    });

    it('has a positive celebrating duration', () => {
      expect(CELEBRATING_DURATION).toBeGreaterThan(0);
    });

    it('has a positive concerned duration', () => {
      expect(CONCERNED_DURATION).toBeGreaterThan(0);
    });
  });

  describe('animation strategies', () => {
    it('uses PingPong strategy for idle', () => {
      expect(IDLE_STRATEGY).toBe(AnimationStrategy.PingPong);
    });

    it('uses Loop strategy for walking', () => {
      expect(WALKING_STRATEGY).toBe(AnimationStrategy.Loop);
    });

    it('uses Loop strategy for working', () => {
      expect(WORKING_STRATEGY).toBe(AnimationStrategy.Loop);
    });

    it('uses PingPong strategy for celebrating', () => {
      expect(CELEBRATING_STRATEGY).toBe(AnimationStrategy.PingPong);
    });

    it('uses Freeze strategy for concerned', () => {
      expect(CONCERNED_STRATEGY).toBe(AnimationStrategy.Freeze);
    });
  });

  describe('orchestrator frame coordinates', () => {
    it('ORCH_IDLE_FRAME_COORDINATES has 2 frames at row 0', () => {
      expect(ORCH_IDLE_FRAME_COORDINATES).toEqual([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]);
    });

    it('ORCH_WORKING_FRAME_COORDINATES has 2 frames at row 1', () => {
      expect(ORCH_WORKING_FRAME_COORDINATES).toEqual([
        { x: 0, y: 1 },
        { x: 1, y: 1 },
      ]);
    });

    it('ORCH_WALKING_FRAME_COORDINATES has 2 frames at row 1', () => {
      expect(ORCH_WALKING_FRAME_COORDINATES).toEqual([
        { x: 2, y: 1 },
        { x: 3, y: 1 },
      ]);
    });

    it('ORCH_CELEBRATING_FRAME_COORDINATES has 2 frames at row 2', () => {
      expect(ORCH_CELEBRATING_FRAME_COORDINATES).toEqual([
        { x: 0, y: 2 },
        { x: 1, y: 2 },
      ]);
    });

    it('ORCH_CONCERNED_FRAME_COORDINATES has 1 frame at (2,0)', () => {
      expect(ORCH_CONCERNED_FRAME_COORDINATES).toEqual([{ x: 2, y: 0 }]);
    });
  });

  describe('orchestrator timing', () => {
    it('ORCH_WORKING_DURATION is 500ms', () => {
      expect(ORCH_WORKING_DURATION).toBe(500);
    });

    it('ORCH_CELEBRATING_DURATION is 250ms', () => {
      expect(ORCH_CELEBRATING_DURATION).toBe(250);
    });

    it('ORCH_IDLE_DURATION is 1200ms', () => {
      expect(ORCH_IDLE_DURATION).toBe(1_200);
    });

    it('ORCH_WALKING_DURATION is 300ms', () => {
      expect(ORCH_WALKING_DURATION).toBe(300);
    });

    it('ORCH_CONCERNED_DURATION is 600ms', () => {
      expect(ORCH_CONCERNED_DURATION).toBe(600);
    });
  });

  describe('orchestrator strategies', () => {
    it('ORCH_WORKING_STRATEGY is Loop', () => {
      expect(ORCH_WORKING_STRATEGY).toBe(AnimationStrategy.Loop);
    });

    // Note: This deliberately differs from subagent CELEBRATING_STRATEGY (PingPong).
    it('ORCH_CELEBRATING_STRATEGY is Loop (not PingPong like subagent)', () => {
      expect(ORCH_CELEBRATING_STRATEGY).toBe(AnimationStrategy.Loop);
    });

    it('ORCH_IDLE_STRATEGY is PingPong', () => {
      expect(ORCH_IDLE_STRATEGY).toBe(AnimationStrategy.PingPong);
    });

    it('ORCH_WALKING_STRATEGY is Loop', () => {
      expect(ORCH_WALKING_STRATEGY).toBe(AnimationStrategy.Loop);
    });

    it('ORCH_CONCERNED_STRATEGY is Freeze', () => {
      expect(ORCH_CONCERNED_STRATEGY).toBe(AnimationStrategy.Freeze);
    });
  });
});
