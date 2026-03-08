import { describe, expect, it } from 'vitest';

import {
  DEACTIVATED_OPACITY,
  ORCH_IDLE_OPACITY,
  PULSE_FREQUENCY,
  SCALE_PULSE_MAX,
  SCALE_PULSE_MIN,
} from '../animation.js';

describe('animation constants', () => {
  it('exports DEACTIVATED_OPACITY as a number between 0 and 1', () => {
    expect(DEACTIVATED_OPACITY).toBeGreaterThan(0);
    expect(DEACTIVATED_OPACITY).toBeLessThan(1);
  });

  it('exports scale pulse range where min >= 1 and min < max', () => {
    expect(SCALE_PULSE_MIN).toBeGreaterThanOrEqual(1);
    expect(SCALE_PULSE_MIN).toBeLessThan(SCALE_PULSE_MAX);
  });

  it('exports PULSE_FREQUENCY as a positive number', () => {
    expect(PULSE_FREQUENCY).toBeGreaterThan(0);
  });

  it('exports ORCH_IDLE_OPACITY between 0 and 1', () => {
    expect(ORCH_IDLE_OPACITY).toBeGreaterThan(0);
    expect(ORCH_IDLE_OPACITY).toBeLessThan(1);
  });
});
