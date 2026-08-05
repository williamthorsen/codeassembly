import { describe, expect, it } from 'vitest';

import { ORCHESTRATOR_PALETTE, SUBAGENT_PALETTE } from '../palettes.ts';

describe('ORCHESTRATOR_PALETTE', () => {
  it('has 7 entries (transparent + 5 shades + beacon bright)', () => {
    expect(ORCHESTRATOR_PALETTE).toHaveLength(7);
    expect(ORCHESTRATOR_PALETTE[0]).toBe('');
    expect(ORCHESTRATOR_PALETTE[6]).toBe('#fff5c0');
  });
});

describe('SUBAGENT_PALETTE', () => {
  it('has 6 entries (transparent + 5 shades) and is unchanged', () => {
    expect(SUBAGENT_PALETTE).toHaveLength(6);
  });
});
