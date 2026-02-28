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
});
