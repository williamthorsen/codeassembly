import { isError } from '@williamthorsen/toolbelt.errors';

/** True when `error` is a filesystem error reporting a path that does not exist. */
export function isMissingFileError(error: unknown): boolean {
  return isError(error) && 'code' in error && error.code === 'ENOENT';
}
