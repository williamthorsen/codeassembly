import { stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { KbRoot } from '../types.js';

const KB_DIR_NAME = '.kb';

/**
 * Walk up the directory tree from `startDir`, returning the first ancestor
 * that contains a `.kb/` directory as a `KbRoot`. Returns `null` when the walk
 * reaches the filesystem root without a hit.
 */
export async function findKbRoot(input: { startDir: string }): Promise<KbRoot | null> {
  let current = resolve(input.startDir);

  for (;;) {
    const kbDir = join(current, KB_DIR_NAME);
    if (await isDirectory(kbDir)) {
      return { path: current, kbDir, via: 'ancestor-walk' };
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/** Return true when the path exists and is a directory; false on any stat failure. */
async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
