import { dirname, join, resolve } from 'node:path';

import { directoryExists } from '../filesystem/exists.ts';
import type { KbRoot } from '../types.ts';

const KB_DIR_NAME = '.kb';

/**
 * Walks up the directory tree from `startDir` & returns the first ancestor containing a `.kb/` directory as a `KbRoot`.
 * Returns `null` when the walk reaches the filesystem root without a hit.
 */
export async function findKbRoot(input: { startDir: string }): Promise<KbRoot | null> {
  for (const current of ancestorDirs(input.startDir)) {
    const kbDir = join(current, KB_DIR_NAME);
    // An unreadable ancestor should be skipped, not abort the upward walk, so any stat failure means "no KB here".
    if (await directoryExists(kbDir, { treatErrorsAsAbsent: true })) {
      return { path: current, kbDir, via: 'ancestor-walk' };
    }
  }
  return null;
}

/** Yields `startDir` (resolved) and each of its ancestor directories up to the filesystem root. */
function* ancestorDirs(startDir: string): Generator<string> {
  let current = resolve(startDir);
  yield current;
  let parent = dirname(current);
  while (parent !== current) {
    current = parent;
    yield current;
    parent = dirname(current);
  }
}
