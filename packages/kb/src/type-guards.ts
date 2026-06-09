/**
 * Checks whether an error is an ENOENT (no such file or directory) filesystem error.
 * @internal
 */
export function isEnoent(error: unknown): boolean {
  return isErrorCode(error, 'ENOENT');
}

/**
 * Returns true when `error` carries the given Node `code` string (e.g. `'ENOENT'`, `'EACCES'`).
 * @internal
 */
export function isErrorCode(error: unknown, code: string): boolean {
  return isObject(error) && error.code === code;
}

/**
 * Type guard for a non-null, non-array object.
 *
 * @internal
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value) && !Array.isArray(value);
}

// region | Helpers

/** Type guard for a non-null object. */
function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}

// endregion | Helpers
