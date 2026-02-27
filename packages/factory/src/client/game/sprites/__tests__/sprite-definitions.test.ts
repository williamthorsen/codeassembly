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
  GRID_COLUMNS,
  GRID_ROWS,
  IDLE_FRAME_COORDINATES,
  WORKING_FRAME_COORDINATES,
  IDLE_DURATION,
  WORKING_DURATION,
  IDLE_STRATEGY,
  WORKING_STRATEGY,
} = await import('../sprite-definitions.js');

const { AnimationStrategy } = await import('excalibur');

describe('sprite definitions', () => {
  describe('idle frame coordinates', () => {
    it('contains coordinates within 3x2 grid bounds', () => {
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

  describe('working frame coordinates', () => {
    it('contains coordinates within 3x2 grid bounds', () => {
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

  describe('duration constants', () => {
    it('has a positive idle duration', () => {
      expect(IDLE_DURATION).toBeGreaterThan(0);
    });

    it('has a positive working duration', () => {
      expect(WORKING_DURATION).toBeGreaterThan(0);
    });
  });

  describe('animation strategies', () => {
    it('uses PingPong strategy for idle', () => {
      expect(IDLE_STRATEGY).toBe(AnimationStrategy.PingPong);
    });

    it('uses Loop strategy for working', () => {
      expect(WORKING_STRATEGY).toBe(AnimationStrategy.Loop);
    });
  });
});
