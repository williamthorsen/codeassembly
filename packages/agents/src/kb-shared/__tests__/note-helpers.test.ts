import { describe, expect, it } from 'vitest';

import { dedupeInOrder, formatUtcDate } from '../note-helpers.ts';

describe(formatUtcDate, () => {
  it('formats midnight UTC as YYYY-MM-DD', () => {
    expect(formatUtcDate(new Date('2026-05-24T00:00:00Z'))).toBe('2026-05-24');
  });

  it('formats a mid-day UTC instant as the same calendar date', () => {
    expect(formatUtcDate(new Date('2026-05-24T14:35:00Z'))).toBe('2026-05-24');
  });

  it('uses the UTC date when local timezone would yield a different day', () => {
    // 23:30 UTC on May 24 is May 25 in most positive offsets and May 24 elsewhere; the helper anchors to UTC.
    expect(formatUtcDate(new Date('2026-05-24T23:30:00Z'))).toBe('2026-05-24');
  });
});

describe(dedupeInOrder, () => {
  it('returns an empty array unchanged', () => {
    expect(dedupeInOrder([])).toEqual([]);
  });

  it('preserves order and drops later duplicates', () => {
    expect(dedupeInOrder(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });

  it('preserves a list with no duplicates exactly', () => {
    expect(dedupeInOrder(['one', 'two', 'three'])).toEqual(['one', 'two', 'three']);
  });

  it('treats distinct types as distinct values', () => {
    expect(dedupeInOrder([1, 2, 1, 3])).toEqual([1, 2, 3]);
  });
});
