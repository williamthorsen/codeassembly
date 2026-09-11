import path from 'node:path';

import { HARNESSES } from '../lib/harness.ts';

/**
 * Reports whether a path lies in a harness's deployed `skills/` or `scripts/` tree, whose files are copied from a source
 * elsewhere. Accepts a repository-relative or an absolute path, since only the segments are read.
 */
export function isHarnessDeployPath(file: string): boolean {
  const segments = file.split(path.sep).flatMap((segment) => segment.split('/'));
  for (const config of Object.values(HARNESSES)) {
    const homeIndex = segments.indexOf(config.homeDir);
    if (homeIndex === -1) continue;
    const next = segments[homeIndex + 1];
    if (next === config.skillsDirName || next === config.scriptsDirName) return true;
  }
  return false;
}
