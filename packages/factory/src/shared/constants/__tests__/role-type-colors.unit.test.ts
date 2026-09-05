import { ROLE_TYPES } from 'codeassembly-run-core';
import { describe, expect, it } from 'vitest';

import { PALETTE } from '../palette.ts';
import {
  getRoleTypeColor,
  getRoleTypeLightFill,
  ROLE_TYPE_COLORS,
  ROLE_TYPE_LIGHT_FILLS,
} from '../role-type-colors.ts';

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

describe('ROLE_TYPE_LIGHT_FILLS', () => {
  it('has an entry for every RoleType', () => {
    for (const roleType of ROLE_TYPES) {
      expect(ROLE_TYPE_LIGHT_FILLS[roleType]).toBeDefined();
    }
  });

  it('has exactly one entry per RoleType', () => {
    expect(Object.keys(ROLE_TYPE_LIGHT_FILLS)).toHaveLength(ROLE_TYPES.length);
  });

  it('assigns values that match the rgba(...) pattern', () => {
    for (const fill of Object.values(ROLE_TYPE_LIGHT_FILLS)) {
      expect(fill).toMatch(/^rgba\(\d+,\d+,\d+,[\d.]+\)$/);
    }
  });
});

describe('getRoleTypeColor', () => {
  it('returns the correct color for each known role type', () => {
    for (const roleType of ROLE_TYPES) {
      expect(getRoleTypeColor(roleType)).toBe(ROLE_TYPE_COLORS[roleType]);
    }
  });

  it('returns the default fallback for an unknown role type', () => {
    expect(getRoleTypeColor('nonexistent')).toBe('#888888');
  });

  it('returns a custom fallback when provided', () => {
    expect(getRoleTypeColor('nonexistent', '#abcdef')).toBe('#abcdef');
  });
});

describe('getRoleTypeLightFill', () => {
  it('returns the correct light fill for each known role type', () => {
    for (const roleType of ROLE_TYPES) {
      expect(getRoleTypeLightFill(roleType)).toBe(ROLE_TYPE_LIGHT_FILLS[roleType]);
    }
  });

  it('returns the default fallback for an unknown role type', () => {
    expect(getRoleTypeLightFill('nonexistent')).toBe('transparent');
  });

  it('returns a custom fallback when provided', () => {
    expect(getRoleTypeLightFill('nonexistent', 'red')).toBe('red');
  });
});
