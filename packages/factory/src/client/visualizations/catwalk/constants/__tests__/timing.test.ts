import { describe, expect, it } from 'vitest';

import { CHUTE_DURATION, PAUSE_DURATION, WALK_SPEED, WORK_DURATION } from '../timing.js';

describe('timing constants', () => {
  it('has WALK_SPEED equal to 400 pixels per second', () => {
    expect(WALK_SPEED).toBe(400);
  });

  it('has CHUTE_DURATION equal to 600 milliseconds', () => {
    expect(CHUTE_DURATION).toBe(600);
  });

  it('has WORK_DURATION equal to 1200 milliseconds', () => {
    expect(WORK_DURATION).toBe(1200);
  });

  it('has PAUSE_DURATION equal to 300 milliseconds', () => {
    expect(PAUSE_DURATION).toBe(300);
  });
});
