import { describe, expect, it } from 'vitest';

import { PALETTE } from '../palette.js';
import { PHASE_NAMES, PHASE_ROLE_TYPE, ROLE_TYPE_COLORS, ROLE_TYPES } from '../role-types.js';

describe('PHASE_ROLE_TYPE', () => {
  it('includes an entry for every phase in PHASE_NAMES', () => {
    for (const phase of PHASE_NAMES) {
      expect(PHASE_ROLE_TYPE[phase]).toBeDefined();
    }
  });
});

describe('ROLE_TYPE_COLORS', () => {
  it('has an entry for every RoleType', () => {
    for (const roleType of ROLE_TYPES) {
      expect(ROLE_TYPE_COLORS[roleType]).toBeDefined();
    }
  });

  it('has exactly one entry per RoleType', () => {
    expect(Object.keys(ROLE_TYPE_COLORS)).toHaveLength(ROLE_TYPES.length);
  });

  it('assigns colors that exist in PALETTE', () => {
    const paletteValues: Set<string> = new Set(Object.values(PALETTE));
    for (const color of Object.values(ROLE_TYPE_COLORS)) {
      expect(paletteValues.has(color)).toBe(true);
    }
  });
});
