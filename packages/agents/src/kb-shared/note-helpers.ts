/** Whole-day divisor for converting a date delta in milliseconds to an age in days. */
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Matches the two accepted stored-date forms: bare `YYYY-MM-DD` or second-precision UTC `YYYY-MM-DDTHH:MM:SSZ`. */
const ACCEPTED_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$/;

/** Formats a `Date` as a second-precision UTC `YYYY-MM-DDTHH:MM:SSZ` timestamp for note frontmatter date fields. */
export function formatUtcTimestamp(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

/**
 * Computes whole days between a stored date value and `now`; `null` for an absent value or one not in an accepted form.
 * A `YYYY-MM-DDTHH:MM:SSZ` timestamp is read as its instant and a bare legacy `YYYY-MM-DD` date as UTC midnight, both
 * truncated to whole-day resolution. Values outside the two accepted forms return `null` rather than a `Date.parse`
 * best-effort age, since a non-`Z` or locale-dependent string would otherwise be silently misread as local time.
 */
export function computeAgeDays(dateValue: string | null, now: Date): number | null {
  if (dateValue === null || !ACCEPTED_DATE.test(dateValue)) {
    return null;
  }
  const parsed = Date.parse(dateValue);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.floor((now.getTime() - parsed) / MILLISECONDS_PER_DAY);
}

/** Returns `values` with duplicate entries dropped, preserving first-occurrence order. */
export function dedupeInOrder<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
