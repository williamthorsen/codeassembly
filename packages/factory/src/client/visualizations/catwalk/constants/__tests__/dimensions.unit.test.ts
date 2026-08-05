import { describe, expect, it } from 'vitest';

import {
  AGENT_RADIUS,
  ART_H,
  ART_W,
  CANVAS_H,
  CANVAS_W,
  GATE_W,
  GROUND_LINE_Y,
  LAYOUT_MARGIN,
  ORCH_RADIUS,
  RAIL_Y,
  STATION_GAP,
} from '../dimensions.js';

describe('canvas dimensions', () => {
  it('has CANVAS_W equal to 1400', () => {
    expect(CANVAS_W).toBe(1_400);
  });

  it('has CANVAS_H equal to 540', () => {
    expect(CANVAS_H).toBe(540);
  });
});

describe('anchor values', () => {
  it('has RAIL_Y equal to 100', () => {
    expect(RAIL_Y).toBe(100);
  });

  it('has GROUND_LINE_Y equal to 382', () => {
    expect(GROUND_LINE_Y).toBe(382);
  });
});

describe('entity sizing', () => {
  it('has positive AGENT_RADIUS', () => {
    expect(AGENT_RADIUS).toBeGreaterThan(0);
  });

  it('has AGENT_RADIUS equal to half the sprite size (16)', () => {
    expect(AGENT_RADIUS).toBe(16);
  });

  it('has ORCH_RADIUS equal to half the sprite size (16)', () => {
    expect(ORCH_RADIUS).toBe(16);
  });

  it('has ORCH_RADIUS greater than or equal to AGENT_RADIUS', () => {
    expect(ORCH_RADIUS).toBeGreaterThanOrEqual(AGENT_RADIUS);
  });

  it('has positive artifact dimensions', () => {
    expect(ART_W).toBeGreaterThan(0);
    expect(ART_H).toBeGreaterThan(0);
  });

  it('has positive GATE_W', () => {
    expect(GATE_W).toBeGreaterThan(0);
  });
});

describe('layout margins', () => {
  it('has positive LAYOUT_MARGIN', () => {
    expect(LAYOUT_MARGIN).toBeGreaterThan(0);
  });

  it('has positive STATION_GAP', () => {
    expect(STATION_GAP).toBeGreaterThan(0);
  });
});
