import { describe, expect, it } from 'vitest';

import {
  ACTIVE_OPACITY,
  CHUTE_DIMMED_OPACITY,
  CHUTE_OPACITY,
  DEACTIVATED_OPACITY,
  GATE_OPACITY,
  IDLE_OPACITY,
  ORCH_IDLE_OPACITY,
  PULSE_FREQUENCY,
  RESTING_OPACITY,
  SCALE_PULSE_MAX,
  SCALE_PULSE_MIN,
} from '../animation.js';

describe('animation constants', () => {
  it('exports agent state opacities in ascending order', () => {
    expect(DEACTIVATED_OPACITY).toBeLessThan(IDLE_OPACITY);
    expect(IDLE_OPACITY).toBeLessThan(RESTING_OPACITY);
    expect(RESTING_OPACITY).toBeLessThan(ACTIVE_OPACITY);
    expect(ACTIVE_OPACITY).toBe(1);
  });

  it('exports ORCH_IDLE_OPACITY between RESTING_OPACITY and ACTIVE_OPACITY', () => {
    expect(ORCH_IDLE_OPACITY).toBeGreaterThan(RESTING_OPACITY);
    expect(ORCH_IDLE_OPACITY).toBeLessThan(ACTIVE_OPACITY);
  });

  it('exports GATE_OPACITY between 0 and 1', () => {
    expect(GATE_OPACITY).toBeGreaterThan(0);
    expect(GATE_OPACITY).toBeLessThan(1);
  });

  it('exports CHUTE_OPACITY and CHUTE_DIMMED_OPACITY with dimmed < normal', () => {
    expect(CHUTE_DIMMED_OPACITY).toBeGreaterThan(0);
    expect(CHUTE_DIMMED_OPACITY).toBeLessThan(CHUTE_OPACITY);
    expect(CHUTE_OPACITY).toBeLessThan(1);
  });

  it('exports scale pulse range where min >= 1 and min < max <= 1.2', () => {
    expect(SCALE_PULSE_MIN).toBeGreaterThanOrEqual(1);
    expect(SCALE_PULSE_MIN).toBeLessThan(SCALE_PULSE_MAX);
    expect(SCALE_PULSE_MAX).toBeLessThanOrEqual(1.2);
  });

  it('exports PULSE_FREQUENCY as a positive number', () => {
    expect(PULSE_FREQUENCY).toBeGreaterThan(0);
  });
});
