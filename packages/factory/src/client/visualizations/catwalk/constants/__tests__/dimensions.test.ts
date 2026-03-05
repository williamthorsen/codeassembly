import { describe, expect, it } from 'vitest';

import {
  AGENT_RADIUS,
  ART_H,
  ART_W,
  CANVAS_H,
  CANVAS_W,
  CATWALK_Y,
  CHUTE_BOT,
  CHUTE_TOP,
  GATE_W,
  GROUND_Y,
  LAYOUT_MARGIN,
  ORCH_RADIUS,
  STATION_GAP,
} from '../dimensions.js';

describe('canvas dimensions', () => {
  it('has CANVAS_W equal to 1400', () => {
    expect(CANVAS_W).toBe(1400);
  });

  it('has CANVAS_H equal to 540', () => {
    expect(CANVAS_H).toBe(540);
  });
});

describe('derived vertical positions', () => {
  it('places CHUTE_TOP below CATWALK_Y', () => {
    expect(CHUTE_TOP).toBeGreaterThan(CATWALK_Y);
  });

  it('places CHUTE_BOT above GROUND_Y', () => {
    expect(CHUTE_BOT).toBeLessThan(GROUND_Y);
  });

  it('ensures CHUTE_TOP is above CHUTE_BOT (positive chute height)', () => {
    expect(CHUTE_TOP).toBeLessThan(CHUTE_BOT);
  });

  it('derives CHUTE_TOP as CATWALK_Y + 48', () => {
    expect(CHUTE_TOP).toBe(CATWALK_Y + 48);
  });

  it('derives CHUTE_BOT as GROUND_Y - 20', () => {
    expect(CHUTE_BOT).toBe(GROUND_Y - 20);
  });
});

describe('anchor values', () => {
  it('has CATWALK_Y equal to 100', () => {
    expect(CATWALK_Y).toBe(100);
  });

  it('has GROUND_Y equal to 340', () => {
    expect(GROUND_Y).toBe(340);
  });
});

describe('entity sizing', () => {
  it('has positive AGENT_RADIUS', () => {
    expect(AGENT_RADIUS).toBeGreaterThan(0);
  });

  it('has ORCH_RADIUS greater than AGENT_RADIUS', () => {
    expect(ORCH_RADIUS).toBeGreaterThan(AGENT_RADIUS);
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
