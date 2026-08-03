import type { ParsedNote } from '@williamthorsen/kb/frontmatter';
import { parseNote } from '@williamthorsen/kb/frontmatter';

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

/** Reads a string-valued field from a frontmatter `extra` map; `null` when absent, non-string, or blank after trimming. */
export function extractString(extra: Record<string, unknown> | undefined, key: string): string | null {
  if (extra === undefined) {
    return null;
  }
  const value = extra[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
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

/** Reports whether an id is a bare filename stem, rejecting path separators and traversal segments so it cannot escape `content/events/`. */
export function isSafeEventId(id: string): boolean {
  return id.length > 0 && !id.includes('/') && !id.includes('\\') && !id.includes('..') && !id.includes('\0');
}

/**
 * Reads a string-list field from a frontmatter `extra` map: a sequence yields its non-empty, trimmed string items; a
 * lone non-empty string is coerced to a one-element list so a mis-authored scalar still surfaces; anything else yields
 * an empty list.
 */
export function readStringList(extra: Record<string, unknown> | undefined, key: string): string[] {
  const value = extra?.[key];
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .map((item) => item.trim());
  }
  return typeof value === 'string' && value.trim() !== '' ? [value.trim()] : [];
}

/** Splits a comma-separated string into items, trimming whitespace and dropping empties. */
export function splitCommaList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** The outcome of a guarded note parse: the parsed note, or a `null` note paired with the read/parse error message. */
export type SafeParseOutcome = { note: ParsedNote } | { note: null; error: string };

/** Parses a note from disk, returning a `null` note plus the error message when the file cannot be read. */
export async function parseNoteSafely(path: string): Promise<SafeParseOutcome> {
  try {
    return { note: await parseNote({ path }) };
  } catch (error) {
    return { note: null, error: error instanceof Error ? error.message : String(error) };
  }
}
