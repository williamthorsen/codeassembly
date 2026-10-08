import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';

import { isEnoent } from '../../src/lib/type-guards.ts';

/** Reads `dir` with file types, returning `[]` when the directory does not exist. */
export async function readDirEntries(dir: string): Promise<Array<Dirent>> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }
}
