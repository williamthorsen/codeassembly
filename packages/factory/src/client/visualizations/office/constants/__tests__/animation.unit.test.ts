import { describe, expect, it } from 'vitest';

import {
  ARTIFACT_APPEAR_PHASE_MS,
  ARTIFACT_APPEAR_SCALE_SPEED,
  ARTIFACT_DELIVER_SPEED_PX_PER_SEC,
  ARTIFACT_OVERSHOOT_SCALE,
  FADE_DURATION_MS,
  STATE_CHANGE_PULSE_HALF_MS,
  STATE_CHANGE_PULSE_OPACITY,
  WALK_SPEED_PX_PER_SEC,
} from '../animation.ts';

describe('animation constants', () => {
  it('exports positive walk speed', () => {
    expect(WALK_SPEED_PX_PER_SEC).toBeGreaterThan(0);
  });

  it('exports positive fade duration', () => {
    expect(FADE_DURATION_MS).toBeGreaterThan(0);
  });

  it('exports pulse opacity between 0 and 1', () => {
    expect(STATE_CHANGE_PULSE_OPACITY).toBeGreaterThan(0);
    expect(STATE_CHANGE_PULSE_OPACITY).toBeLessThan(1);
  });

  it('exports positive pulse half duration', () => {
    expect(STATE_CHANGE_PULSE_HALF_MS).toBeGreaterThan(0);
  });

  it('exports overshoot scale above 1', () => {
    expect(ARTIFACT_OVERSHOOT_SCALE).toBeGreaterThan(1);
  });

  it('exports positive artifact appear phase duration', () => {
    expect(ARTIFACT_APPEAR_PHASE_MS).toBeGreaterThan(0);
  });

  it('derives scale speed from phase duration and overshoot', () => {
    const expected = ARTIFACT_OVERSHOOT_SCALE / (ARTIFACT_APPEAR_PHASE_MS / 1_000);
    expect(ARTIFACT_APPEAR_SCALE_SPEED).toBeCloseTo(expected);
  });

  it('exports positive delivery speed', () => {
    expect(ARTIFACT_DELIVER_SPEED_PX_PER_SEC).toBeGreaterThan(0);
  });
});
