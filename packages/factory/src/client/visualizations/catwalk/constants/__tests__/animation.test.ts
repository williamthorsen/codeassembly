import { describe, expect, it } from 'vitest';

import {
  AGENT_PULSE_MAX,
  AGENT_PULSE_MIN,
  DEACTIVATED_OPACITY,
  ORCH_IDLE_OPACITY,
  ORCH_PULSE_MAX,
  ORCH_PULSE_MIN,
  PULSE_FREQUENCY,
} from '../animation.js';

describe('animation constants', () => {
  it('exports DEACTIVATED_OPACITY as a number between 0 and 1', () => {
    expect(DEACTIVATED_OPACITY).toBeGreaterThan(0);
    expect(DEACTIVATED_OPACITY).toBeLessThan(1);
  });

  it('exports orchestrator pulse range where min < max', () => {
    expect(ORCH_PULSE_MIN).toBeLessThan(ORCH_PULSE_MAX);
    expect(ORCH_PULSE_MIN).toBeGreaterThan(0);
    expect(ORCH_PULSE_MAX).toBeLessThanOrEqual(1);
  });

  it('exports agent pulse range where min < max', () => {
    expect(AGENT_PULSE_MIN).toBeLessThan(AGENT_PULSE_MAX);
    expect(AGENT_PULSE_MIN).toBeGreaterThan(0);
    expect(AGENT_PULSE_MAX).toBeLessThanOrEqual(1);
  });

  it('exports PULSE_FREQUENCY as a positive number', () => {
    expect(PULSE_FREQUENCY).toBeGreaterThan(0);
  });

  it('exports ORCH_IDLE_OPACITY between 0 and 1', () => {
    expect(ORCH_IDLE_OPACITY).toBeGreaterThan(0);
    expect(ORCH_IDLE_OPACITY).toBeLessThan(1);
  });
});
