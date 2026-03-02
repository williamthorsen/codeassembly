import { describe, expect, it } from 'vitest';

import { PHASE_NAMES, PHASE_ROLE, PHASE_ROLE_TYPE, ROLE_TYPES } from '../role-types.js';

describe('PHASE_NAMES', () => {
  it('contains the expected set of phases', () => {
    expect([...PHASE_NAMES]).toEqual([
      'architecture',
      'planning',
      'implementation',
      'review',
      'simplifier',
      'holistic',
      'summary',
    ]);
  });
});

describe('ROLE_TYPES', () => {
  it('contains the expected set of role types', () => {
    expect([...ROLE_TYPES]).toEqual(['orchestrator', 'analyst', 'planner', 'author', 'reviewer']);
  });
});

describe('PHASE_ROLE', () => {
  it('has an entry for every phase name', () => {
    for (const phase of PHASE_NAMES) {
      expect(PHASE_ROLE[phase]).toBeDefined();
      expect(typeof PHASE_ROLE[phase]).toBe('string');
    }
  });

  it('maps expected phases to expected roles', () => {
    expect(PHASE_ROLE.architecture).toBe('architect');
    expect(PHASE_ROLE.planning).toBe('planner');
    expect(PHASE_ROLE.implementation).toBe('coder');
    expect(PHASE_ROLE.review).toBe('reviewer');
    expect(PHASE_ROLE.simplifier).toBe('simplifier');
    expect(PHASE_ROLE.holistic).toBe('holistic reviewer');
    expect(PHASE_ROLE.summary).toBe('orchestrator');
  });
});

describe('PHASE_ROLE_TYPE', () => {
  it('has an entry for every phase name', () => {
    for (const phase of PHASE_NAMES) {
      expect(PHASE_ROLE_TYPE[phase]).toBeDefined();
    }
  });

  it('maps every phase to a valid role type', () => {
    const validRoleTypes = new Set(ROLE_TYPES);
    for (const phase of PHASE_NAMES) {
      expect(validRoleTypes.has(PHASE_ROLE_TYPE[phase])).toBe(true);
    }
  });
});
