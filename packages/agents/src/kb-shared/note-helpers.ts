/** Whole-day divisor for converting a date delta in milliseconds to an age in days. */
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Formats a `Date` as a UTC `YYYY-MM-DD` string for note frontmatter date fields. */
export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Computes whole days between a `YYYY-MM-DD` date string and `now`; `null` for an absent or unparseable value. */
export function computeAgeDays(dateValue: string | null, now: Date): number | null {
  if (dateValue === null) {
    return null;
  }
  const parsed = Date.parse(`${dateValue}T00:00:00Z`);
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
