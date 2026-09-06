import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { pathExists } from '../filesystem/exists.ts';
import { writeAtomic } from '../filesystem/write-atomic.ts';
import { ALIASES_FILE, CONFIG_FILE, CONTENT_DIR, EVENTS_DIR } from '../layout/index.ts';
import { renderAliasesSeed, renderConfigSeed } from './render-seeds.ts';

/**
 * What {@link scaffold} did about one canonical path: `created` where it was absent, `present` where it was left as
 * found, `replaced` where `force` overwrote it.
 */
export type ScaffoldAction = 'created' | 'present' | 'replaced';

/** One canonical path and what the scaffold did about it. */
export interface ScaffoldEntry {
  /** The store-relative path, directories carrying a trailing slash. */
  path: string;
  action: ScaffoldAction;
}

/**
 * Writes the canonical files and directories every knowledge-base store holds, leaving an existing file as it found it
 * unless `force` is set. Directories are ensured either way, since a directory has no content to replace.
 *
 * The function asserts nothing about the store: a caller that requires one to exist, or requires one not to, checks
 * that itself. `create` calls it on a directory it has just confirmed holds no store, and `kb scaffold` on one it has
 * just confirmed does.
 */
export async function scaffold(input: { storePath: string; force?: boolean }): Promise<readonly ScaffoldEntry[]> {
  const { storePath, force = false } = input;
  const entries: ScaffoldEntry[] = [];

  for (const file of CANONICAL_FILES) {
    const absolutePath = join(storePath, file.path);
    const exists = await pathExists(absolutePath);
    if (exists && !force) {
      entries.push({ path: file.path, action: 'present' });
      continue;
    }
    // The file's parent is `.kb/`, which a store already holds but a directory that `create` is scaffolding does not.
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeAtomic(absolutePath, file.render());
    entries.push({ path: file.path, action: exists ? 'replaced' : 'created' });
  }

  for (const directory of CANONICAL_DIRECTORIES) {
    const absolutePath = join(storePath, directory);
    const exists = await pathExists(absolutePath);
    await mkdir(absolutePath, { recursive: true });
    entries.push({ path: `${directory}/`, action: exists ? 'present' : 'created' });
  }

  return entries;
}

// region | Helpers

// The canonical set: what a store holds regardless of when it was created. `kb create` and `kb scaffold` both write it
// from here, so a file added to either list reaches both commands and neither can drift from the other.
//
// `.kb/taxonomy.yaml` is not canonical: `kb taxonomy init` derives its content from the notes a store holds rather
// than writing a fixed template. Nor is `content/assertions/`: `kb-add` creates its target folder on demand.

/** The directories every store holds. */
const CANONICAL_DIRECTORIES: readonly string[] = [CONTENT_DIR, EVENTS_DIR];

/** The files every store holds, each paired with the seed it is written from. */
const CANONICAL_FILES: readonly { path: string; render: () => string }[] = [
  { path: CONFIG_FILE, render: renderConfigSeed },
  { path: ALIASES_FILE, render: renderAliasesSeed },
];

// endregion | Helpers
