/** True when `error` is a filesystem error reporting a path that does not exist. */
export function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
