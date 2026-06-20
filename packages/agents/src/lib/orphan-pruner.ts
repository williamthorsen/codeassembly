import path from 'node:path';

import { removeItem } from './installer.ts';
import { detectDrift } from './manifest.ts';
import type { ManifestEntry } from './types.ts';

/** Options controlling orphan pruning, mirroring the install flags that govern it. */
interface PruneOptions {
  readonly force: boolean;
  readonly dryRun: boolean;
}

/** Outcome of a prune pass: entries to keep tracking in the manifest, and the relative paths dropped from it. */
interface PruneResult {
  readonly retained: ReadonlyArray<ManifestEntry>;
  readonly removedPaths: ReadonlyArray<string>;
}

/**
 * Removes installed files recorded in `previousEntries` whose source no longer exists — those whose
 * `relativePath` is absent from `currentEntries` — resolving paths against the install root `home`.
 *
 * A `linked` orphan is a symlink CodeAssembly owns whose source is gone, so it is removed outright (a symlink
 * has no content to be user-modified). An unlinked orphan is removed unless the user modified it and `force`
 * is unset, in which case it is retained so the manifest keeps tracking it. In `dryRun`, removals are reported
 * and recorded but not performed.
 */
export async function pruneOrphanedEntries(
  previousEntries: ReadonlyArray<ManifestEntry>,
  currentEntries: ReadonlyArray<ManifestEntry>,
  home: string,
  options: PruneOptions,
): Promise<PruneResult> {
  const currentPaths = new Set(currentEntries.map((entry) => entry.relativePath));
  const orphans = previousEntries.filter((entry) => !currentPaths.has(entry.relativePath));

  const retained: Array<ManifestEntry> = [];
  const removedPaths: Array<string> = [];

  for (const orphan of orphans) {
    const fullPath = path.join(home, orphan.relativePath);

    if (orphan.linked) {
      await removeOrphan(fullPath, orphan.relativePath, removedPaths, options.dryRun);
      continue;
    }

    const drift = await detectDrift(orphan, home);

    if (drift === 'missing') {
      removedPaths.push(orphan.relativePath);
      continue;
    }

    if (drift === 'modified' && !options.force) {
      console.warn(`  ⚠️ Keeping modified stale item: ${orphan.relativePath}`);
      retained.push(orphan);
      continue;
    }

    await removeOrphan(fullPath, orphan.relativePath, removedPaths, options.dryRun);
  }

  return { retained, removedPaths };
}

// region | Helpers

/** Removes one orphan (unless `dryRun`), records its relative path, and reports the action. */
async function removeOrphan(
  fullPath: string,
  relativePath: string,
  removedPaths: Array<string>,
  dryRun: boolean,
): Promise<void> {
  removedPaths.push(relativePath);
  if (dryRun) {
    console.info(`  [dry-run] Would remove stale item: ${relativePath}`);
    return;
  }
  await removeItem(fullPath);
  console.info(`  🗑️ Removed stale item: ${relativePath}`);
}

// endregion | Helpers
