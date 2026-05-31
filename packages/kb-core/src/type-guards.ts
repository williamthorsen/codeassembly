/** Returns true when `error` carries the given Node `code` string (e.g. `'ENOENT'`, `'EACCES'`). */
export function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/** Checks whether an error is an ENOENT (no such file or directory) filesystem error. */
export function isEnoent(error: unknown): boolean {
  return isErrorCode(error, 'ENOENT');
}

/**
 * Type guard for a non-null, non-array object.
 *
 * @internal
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
