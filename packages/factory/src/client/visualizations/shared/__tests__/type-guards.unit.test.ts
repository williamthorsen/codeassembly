import { describe, expect, it } from 'vitest';

import { isRecord } from '../type-guards.js';

describe(isRecord, () => {
  it('accepts a plain object', () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('rejects an array', () => {
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it('rejects null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('rejects a primitive', () => {
    expect(isRecord('text')).toBe(false);
  });
});
