import { describe, expect, it } from 'vitest';

import { ARTIFACT_COLORS, type ArtifactColorKey } from '../artifact-colors.js';

const EXPECTED_KEYS: readonly ArtifactColorKey[] = [
  'reqs',
  'xplan',
  'arch',
  'plan',
  'code',
  'review',
  'fixes',
  'clean',
  'holi',
  'summary',
];

describe('ARTIFACT_COLORS', () => {
  it('contains exactly the expected set of keys', () => {
    // eslint-disable-next-line unicorn/no-array-sort -- toSorted() unavailable in configured Node range
    expect(Object.keys(ARTIFACT_COLORS).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it('has exactly 10 entries', () => {
    expect(Object.keys(ARTIFACT_COLORS)).toHaveLength(10);
  });

  it('maps every key to a valid 6-digit hex color', () => {
    for (const value of Object.values(ARTIFACT_COLORS)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('maps each key to a distinct color', () => {
    const values = Object.values(ARTIFACT_COLORS);
    expect(new Set(values).size).toBe(values.length);
  });
});
