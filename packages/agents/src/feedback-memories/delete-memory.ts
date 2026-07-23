import { readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { isEnoent } from '../lib/type-guards.ts';
import { removeMemoryIndexEntry } from './reconcile-memory-index.ts';
import type { DeleteOutcome, DeleteSuccess } from './types.ts';

/**
 * Deletes a batch of memory files and reconciles each affected `MEMORY.md`. Files are removed first, then the index of
 * each store is read, stripped of every deleted memory's line, and rewritten once — so a store with many deletions is
 * touched a single time. An already-absent file and a store with no `MEMORY.md` line are non-fatal, reported per path.
 * A missing filesystem entry is tolerated; other I/O errors propagate as system failures.
 */
export async function deleteMemories(input: { paths: readonly string[] }): Promise<DeleteSuccess> {
  const deleted = await deleteFiles(input.paths);
  const indexUpdated = await reconcileIndexes(input.paths);

  const results: DeleteOutcome[] = input.paths.map((path) => {
    const fileGone = deleted.get(path) ?? false;
    const indexHit = indexUpdated.get(path) ?? false;
    const note = noteFor(fileGone, indexHit);
    return {
      path,
      deleted: fileGone,
      indexUpdated: indexHit,
      ...(note !== undefined && { note }),
    };
  });

  return { ok: true, results };
}

// region | Helpers

/** Removes each file, mapping its path to whether a file was actually unlinked (false when already absent). */
async function deleteFiles(paths: readonly string[]): Promise<Map<string, boolean>> {
  const deleted = new Map<string, boolean>();
  for (const path of paths) {
    try {
      await unlink(path);
      deleted.set(path, true);
    } catch (error) {
      if (isEnoent(error)) {
        deleted.set(path, false);
        continue;
      }
      throw error;
    }
  }
  return deleted;
}

/**
 * Reconciles each store's `MEMORY.md` once, mapping every path to whether its index line was found and removed. Paths
 * are grouped by their sibling index so a store is read and rewritten a single time regardless of how many of its
 * memories are in the batch. An absent index leaves every grouped path at `false`.
 */
async function reconcileIndexes(paths: readonly string[]): Promise<Map<string, boolean>> {
  const indexUpdated = new Map<string, boolean>();
  for (const [indexPath, groupedPaths] of groupByIndex(paths)) {
    let content: string;
    try {
      content = await readFile(indexPath, 'utf8');
    } catch (error) {
      if (isEnoent(error)) {
        for (const path of groupedPaths) {
          indexUpdated.set(path, false);
        }
        continue;
      }
      throw error;
    }

    let changed = false;
    for (const path of groupedPaths) {
      const result = removeMemoryIndexEntry(content, basename(path));
      content = result.content;
      indexUpdated.set(path, result.removed);
      changed ||= result.removed;
    }
    if (changed) {
      await writeFile(indexPath, content, 'utf8');
    }
  }
  return indexUpdated;
}

/** Groups paths by their sibling `MEMORY.md` index path, preserving each group's input order. */
function groupByIndex(paths: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const indexPath = join(dirname(path), 'MEMORY.md');
    const group = groups.get(indexPath) ?? [];
    group.push(path);
    groups.set(indexPath, group);
  }
  return groups;
}

/** Builds the per-path note describing any non-fatal condition, or `undefined` when the delete was clean. */
function noteFor(fileGone: boolean, indexHit: boolean): string | undefined {
  if (!fileGone && !indexHit) {
    return 'file already absent and no MEMORY.md line matched';
  }
  if (!fileGone) {
    return 'file already absent';
  }
  if (!indexHit) {
    return 'no MEMORY.md line matched';
  }
  return undefined;
}

// endregion | Helpers
