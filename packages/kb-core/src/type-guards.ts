/** Check whether an error is an ENOENT (no such file or directory) filesystem error. */
export function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
