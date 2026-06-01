/** Narrow an unknown value to a non-null, non-array object (safe for `Object.keys`). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
