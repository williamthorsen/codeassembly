import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';

import { isMissingFile } from './type-guards.ts';

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
