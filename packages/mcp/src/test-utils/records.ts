/** Extracts a string property from a record, throwing when the property holds anything else. */
export function getStringField(obj: Record<string, unknown>, field: string): string {
  const value = obj[field];
  if (typeof value !== 'string') throw new Error(`Expected string for ${field}, got ${typeof value}`);
  return value;
}

/** Narrows an unknown value to a record, throwing with `label` when it is not one. */
export function toRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Expected ${label} to be an object`);
  return value;
}

// region | Helpers

/** Reports whether a value is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// endregion | Helpers
