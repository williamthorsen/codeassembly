/** Formats a `Date` as a UTC `YYYY-MM-DD` string for note frontmatter date fields. */
export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
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
