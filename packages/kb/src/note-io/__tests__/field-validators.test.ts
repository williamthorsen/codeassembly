import { describe, expect, it } from 'vitest';

import { asStringList, isValidDate } from '../field-validators.ts';

describe(asStringList, () => {
  it('returns the string members of an array', () => {
    expect(asStringList(['git', 'rebase'])).toEqual(['git', 'rebase']);
  });

  it('drops non-string members', () => {
    expect(asStringList(['git', 3, true])).toEqual(['git']);
  });

  it('treats an absent value as an empty list', () => {
    expect(asStringList(undefined)).toEqual([]);
  });

  it('returns null for a present non-list value', () => {
    expect(asStringList('git')).toBeNull();
  });
});

describe(isValidDate, () => {
  it('accepts a bare calendar date', () => {
    expect(isValidDate('2026-05-01')).toBe(true);
  });

  it('accepts a second-precision UTC timestamp', () => {
    expect(isValidDate('2026-05-01T07:48:16Z')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidDate('')).toBe(false);
  });

  it('rejects a malformed string', () => {
    expect(isValidDate('last tuesday')).toBe(false);
  });

  it('rejects an unreal calendar date', () => {
    expect(isValidDate('2026-02-30')).toBe(false);
  });

  it('rejects a timestamp without the trailing Z', () => {
    expect(isValidDate('2026-05-01T07:48:16')).toBe(false);
  });
});
