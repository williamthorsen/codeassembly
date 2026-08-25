import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isMissingFile } from './type-guards.ts';

/** What disqualifies a directory as a content source: which condition holds, and the phrase describing it. */
export interface SourceProblem {
  readonly kind: 'missing' | 'not-a-directory' | 'unreadable';
  readonly detail: string;
}

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
  if (segments.includes('')) {
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
 * into the "unreadable" case so it surfaces through a message naming `dir`.
 *
 * The condition is reported as a `kind` beside the phrase describing it, so a caller that treats the conditions
 * differently branches on the classification rather than on prose written for a reader.
 */
export async function findSourceProblem(dir: string): Promise<SourceProblem | undefined> {
  try {
    if (!(await stat(dir)).isDirectory()) {
      return { kind: 'not-a-directory', detail: 'not a directory' };
    }
    // Probe the read+traverse access the resolver's frontmatter lookups rely on, so a directory that stats as a
    // directory but is itself unreadable (e.g. mode 000) fails here with the attributed error rather than as a raw
    // EACCES mid-resolution — or not at all when no declared artifact happens to reach into it.
    await access(dir, constants.R_OK | constants.X_OK);
    return undefined;
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return { kind: 'missing', detail: 'does not exist' };
    }
    return { kind: 'unreadable', detail: `unreadable — ${describeError(error)}` };
  }
}
