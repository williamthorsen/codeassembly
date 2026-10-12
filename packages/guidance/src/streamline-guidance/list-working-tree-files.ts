import { existsSync } from 'node:fs';
import path from 'node:path';

import type { StreamlineGit } from './git.ts';

/**
 * Lists the repository-relative files that git tracks or would track, matching the given pathspecs, that exist in the
 * working tree. A file deleted from the working tree but still in the index is dropped, since nothing can read it.
 */
export function listWorkingTreeFiles(root: string, git: StreamlineGit, pathspecs: readonly string[] = []): string[] {
  return git.listFiles(root, pathspecs).filter((file) => existsSync(path.join(root, file)));
}
