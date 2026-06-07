/**
 * Returns true when `error` carries the given Node `code` string (e.g. `'ENOENT'`, `'EACCES'`).
 * @internal
 */
export function isErrorCode(error: unknown, code: string): boolean {
  return isObject(error) && error.code === code;
}

/**
 * Checks whether an error is an ENOENT (no such file or directory) filesystem error.
 * @internal
 */
export function isEnoent(error: unknown): boolean {
  return isErrorCode(error, 'ENOENT');
}

/**
 * True when a file read failed because the path is absent (`ENOENT`) or a path segment is not a directory
 * (`ENOTDIR`); both mean the target file is not there. Prefer this over `isEnoent` when reading a file nested
 * under a directory that may itself be absent or replaced by a regular file (e.g. a `<dir>/SKILL.md` probe).
 * @internal
 */
export function isMissingFile(error: unknown): boolean {
  return isErrorCode(error, 'ENOENT') || isErrorCode(error, 'ENOTDIR');
}

/**
 * Type guard for a non-null, non-array object.
 * @internal
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value) && !Array.isArray(value);
}

/** Type guard for a non-null object; the looser building block the exported guards are defined in terms of. */
function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}
