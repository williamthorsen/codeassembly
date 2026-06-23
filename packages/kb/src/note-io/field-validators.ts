// Leaf validators shared by the per-type record modules. They operate on raw field values from a parsed note's
// frontmatter map and carry no record-type knowledge.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * Coerces a frontmatter field value to a string list: the array's string members when it is a sequence, an empty list
 * when the value is absent, or `null` when the value is present but not list-shaped (so a parser can flag it).
 */
export function asStringList(value: unknown): string[] | null {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Reports whether a value is a real UTC instant in either bare `YYYY-MM-DD` or second-precision `YYYY-MM-DDTHH:MM:SSZ`
 * form. An unmarked or offset timestamp matches neither pattern; an unreal calendar date or clock time fails the
 * `Date.UTC` round-trip.
 */
export function isValidDate(value: string): boolean {
  const dateOnly = DATE_ONLY.test(value);
  if (!dateOnly && !TIMESTAMP.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = dateOnly ? 0 : Number(value.slice(11, 13));
  const minute = dateOnly ? 0 : Number(value.slice(14, 16));
  const second = dateOnly ? 0 : Number(value.slice(17, 19));
  const roundTrip = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day &&
    roundTrip.getUTCHours() === hour &&
    roundTrip.getUTCMinutes() === minute &&
    roundTrip.getUTCSeconds() === second
  );
}
