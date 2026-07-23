import { describe, expect, it } from 'vitest';

import { computeAgeDays, dedupeInOrder, formatUtcTimestamp, readStringList, splitCommaList } from '../note-helpers.ts';

describe(formatUtcTimestamp, () => {
  it('formats midnight UTC as a second-precision timestamp', () => {
    expect(formatUtcTimestamp(new Date('2026-05-24T00:00:00Z'))).toBe('2026-05-24T00:00:00Z');
  });

  it('formats a mid-day UTC instant to whole-second precision', () => {
    expect(formatUtcTimestamp(new Date('2026-05-24T14:35:09Z'))).toBe('2026-05-24T14:35:09Z');
  });

  it('drops sub-second milliseconds', () => {
    expect(formatUtcTimestamp(new Date('2026-05-24T14:35:09.987Z'))).toBe('2026-05-24T14:35:09Z');
  });

  it('anchors to UTC when the local timezone would yield a different day', () => {
    expect(formatUtcTimestamp(new Date('2026-05-24T23:30:00Z'))).toBe('2026-05-24T23:30:00Z');
  });
});

describe(computeAgeDays, () => {
  const now = new Date('2026-05-24T12:00:00Z');

  it('returns null for an absent value', () => {
    expect(computeAgeDays(null, now)).toBeNull();
  });

  it('returns null for an unparseable value', () => {
    expect(computeAgeDays('not-a-date', now)).toBeNull();
  });

  it.each(['2024/01/15', '2024-1-5', '2026-05-01T14:35:09', '2026-05-01T14:35:09+00:00'])(
    'returns null for the Date.parse-able but non-accepted form %s',
    (value) => {
      expect(computeAgeDays(value, now)).toBeNull();
    },
  );

  it('computes whole-day age for a bare legacy date read as UTC midnight', () => {
    expect(computeAgeDays('2026-05-20', now)).toBe(4);
  });

  it('computes the same whole-day age for a midnight timestamp of the same date', () => {
    expect(computeAgeDays('2026-05-20T00:00:00Z', now)).toBe(computeAgeDays('2026-05-20', now));
  });

  it('reads a same-day timestamp earlier than now as zero whole days', () => {
    expect(computeAgeDays('2026-05-24T09:00:00Z', now)).toBe(0);
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

describe(splitCommaList, () => {
  it('splits a comma-separated string into items', () => {
    expect(splitCommaList('alpha,beta,gamma')).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('trims surrounding whitespace from each item', () => {
    expect(splitCommaList(' alpha , beta ,gamma ')).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('drops empty items left by leading, trailing, or doubled commas', () => {
    expect(splitCommaList(',alpha,,beta,')).toEqual(['alpha', 'beta']);
  });

  it('returns an empty list for an empty string', () => {
    expect(splitCommaList('')).toEqual([]);
  });

  it('returns an empty list for a whitespace-and-comma-only string', () => {
    expect(splitCommaList(' , , ')).toEqual([]);
  });
});

describe(readStringList, () => {
  it('returns an empty list when the field is absent', () => {
    expect(readStringList({}, 'addressed-by')).toEqual([]);
  });

  it('returns an empty list when the extra map is undefined', () => {
    expect(readStringList(undefined, 'addressed-by')).toEqual([]);
  });

  it('returns a sequence of non-empty trimmed string items', () => {
    expect(readStringList({ 'addressed-by': [' [[fix]] ', 'commit-abc', ''] }, 'addressed-by')).toEqual([
      '[[fix]]',
      'commit-abc',
    ]);
  });

  it('drops non-string items from a sequence', () => {
    expect(readStringList({ 'addressed-by': ['keep', 42, null, { x: 1 }] }, 'addressed-by')).toEqual(['keep']);
  });

  it('coerces a lone non-empty scalar to a one-element list', () => {
    expect(readStringList({ 'addressed-by': ' [[fix]] ' }, 'addressed-by')).toEqual(['[[fix]]']);
  });

  it('returns an empty list for a whitespace-only scalar', () => {
    expect(readStringList({ 'addressed-by': ' '.repeat(3) }, 'addressed-by')).toEqual([]);
  });
});
