import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';

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

// region | Helpers

/** True when a filesystem call failed because the path does not exist. */
function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

// endregion | Helpers
