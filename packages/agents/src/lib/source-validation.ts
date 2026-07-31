import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';

import { isMissingFile } from './type-guards.ts';

/**
 * Reports what disqualifies a source `name` from serving as the directory segments its support entries deploy under,
 * or `undefined` when it can. A scoped package name is valid and nests as its own segments, so `/` separates segments
 * rather than being rejected outright; what is rejected is anything that would escape the namespace or name no
 * directory at all.
 *
 * Checked for every source rather than only those shipping support entries: the segment is part of a source's
 * contract, and a check deferred until a producer first adds support files would surface at that producer's consumers
 * rather than at the producer.
 */
export function describeSourceNameProblem(name: string): string | undefined {
  if (name === '') {
    return 'it is empty';
  }
  if (name.includes('\\') || name.includes('\0')) {
    return 'it carries a path separator or control character';
  }
  if (name.startsWith('/')) {
    return 'it is an absolute path';
  }
  const segments = name.split('/');
  if (segments.some((segment) => segment === '')) {
    return 'it carries an empty path segment';
  }
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return 'it carries a relative path segment';
  }
  return undefined;
}

/**
 * Reports what disqualifies `dir` as a content source (that it is missing, not a directory, or unreadable) or
 * `undefined` when valid. Validity requires both that `dir` is a directory and that the process can read and traverse
 * it, because `stat` alone passes a directory that is itself unreadable (`stat` needs only search permission on the
 * parent chain, not on `dir`). Any permission failure (from the `stat` or the read-and-traverse access probe) folds
 * into the "unreadable" case so it surfaces through an error naming `dir`.
 */
export async function describeSourceProblem(dir: string): Promise<string | undefined> {
  try {
    if (!(await stat(dir)).isDirectory()) {
      return 'not a directory';
    }
    // Probe the read+traverse access the resolver's frontmatter lookups rely on, so a directory that stats as a
    // directory but is itself unreadable (e.g. mode 000) fails here with the attributed error rather than as a raw
    // EACCES mid-resolution — or not at all when no declared artifact happens to reach into it.
    await access(dir, constants.R_OK | constants.X_OK);
    return undefined;
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return 'does not exist';
    }
    return `unreadable — ${error instanceof Error ? error.message : String(error)}`;
  }
}
