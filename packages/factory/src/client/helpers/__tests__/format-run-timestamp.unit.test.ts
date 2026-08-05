import { describe, expect, it } from 'vitest';

import { formatRunTimestamp } from '../format-run-timestamp.js';

describe('formatRunTimestamp', () => {
  it('formats a valid ISO timestamp', () => {
    expect(formatRunTimestamp('2026-01-01T23:59:00Z')).toBe('2026-01-01 23:59 UTC');
  });

  it('zero-pads single-digit month, day, hours, and minutes', () => {
    expect(formatRunTimestamp('2026-03-05T04:07:00Z')).toBe('2026-03-05 04:07 UTC');
  });

  it('returns the original string for an empty string', () => {
    expect(formatRunTimestamp('')).toBe('');
  });

  it('returns the original string for a non-parseable value', () => {
    expect(formatRunTimestamp('not-a-date')).toBe('not-a-date');
  });

  it('drops seconds and milliseconds from the output', () => {
    expect(formatRunTimestamp('2026-06-15T14:32:47Z')).toBe('2026-06-15 14:32 UTC');
  });
});
