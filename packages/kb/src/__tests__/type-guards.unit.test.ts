import { describe, expect, it } from 'vitest';

import { isEnoent, isErrorCode } from '../type-guards.ts';

describe(isErrorCode, () => {
  it('returns true when the error carries the matching code', () => {
    expect(isErrorCode({ code: 'EACCES' }, 'EACCES')).toBe(true);
  });

  it('returns false when the error code differs', () => {
    expect(isErrorCode({ code: 'ENOENT' }, 'EACCES')).toBe(false);
  });

  it('returns false when the value has no code property', () => {
    expect(isErrorCode(new Error('boom'), 'EACCES')).toBe(false);
  });

  it.each([null, undefined, 'EACCES', 42])('returns false for the non-object value %p', (value) => {
    expect(isErrorCode(value, 'EACCES')).toBe(false);
  });
});

describe(isEnoent, () => {
  it('returns true for an ENOENT error', () => {
    expect(isEnoent({ code: 'ENOENT' })).toBe(true);
  });

  it('returns false for a non-ENOENT error code', () => {
    expect(isEnoent({ code: 'ENOTDIR' })).toBe(false);
  });
});
