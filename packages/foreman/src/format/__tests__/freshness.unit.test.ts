import { describe, expect, it } from 'vitest';

import { formatFreshness } from '../freshness.ts';

const NOW_MS = Date.parse('2026-07-19T12:00:00.000Z');

describe('formatFreshness', () => {
  it.each([
    ['2026-07-19T11:59:48.000Z', '12s ago'],
    ['2026-07-19T11:56:20.000Z', '3m 40s ago'],
    ['2026-07-19T09:55:00.000Z', '2h 5m ago'],
    ['2026-07-19T11:59:59.999Z', '0s ago'],
  ])('formats %s as "%s"', (tsIso, expected) => {
    expect(formatFreshness(tsIso, NOW_MS)).toBe(expected);
  });

  it('clamps a timestamp in the future to zero age', () => {
    expect(formatFreshness('2026-07-19T12:00:05.000Z', NOW_MS)).toBe('0s ago');
  });

  it('returns the placeholder for null', () => {
    expect(formatFreshness(null, NOW_MS)).toBe('—');
  });

  it('returns the placeholder for an unparseable timestamp', () => {
    expect(formatFreshness('not-a-date', NOW_MS)).toBe('—');
  });
});
