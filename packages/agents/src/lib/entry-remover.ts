import path from 'node:path';

import { removeItem } from './installer.ts';
import { detectDrift } from './manifest.ts';
import type { ManifestEntry } from './types.ts';

/** Fate of an owned manifest entry during removal: delete it, keep it (user-modified, no force), or note it is already gone from disk. */
export type OwnedEntryVerdict = 'remove' | 'retain' | 'absent';

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
 * Decides an owned manifest entry's fate during removal. A symlink (no user-modifiable content) or an
 * unmodified-or-forced file is removed; a user-modified file without `force` is retained; an entry already
 * gone from disk is absent. Checking `linked` before drift detection is what lets a dangling symlink — which
 * `detectDrift` reports as `missing` — be removed rather than treated as already gone.
 */
export async function classifyOwnedEntry(
  entry: ManifestEntry,
  home: string,
  force: boolean,
): Promise<OwnedEntryVerdict> {
  if (entry.linked) {
    return 'remove';
  }

  const drift = await detectDrift(entry, home);
  if (drift === 'missing') {
    return 'absent';
  }
  if (drift === 'modified' && !force) {
    return 'retain';
  }
  return 'remove';
}

/**
 * Removes installed files recorded in `previousEntries` whose source no longer exists — those whose
 * `relativePath` is absent from `currentEntries` — resolving paths against the install root `home`. Each
 * orphan's fate follows `classifyOwnedEntry`; a retained (user-modified, unforced) orphan stays tracked in
 * the manifest. In `dryRun`, removals are reported and recorded but not performed.
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
    const verdict = await classifyOwnedEntry(orphan, home, options.force);

    if (verdict === 'retain') {
      console.warn(`  ⚠️ Keeping modified stale item: ${orphan.relativePath}`);
      retained.push(orphan);
      continue;
    }

    if (verdict === 'absent') {
      removedPaths.push(orphan.relativePath);
      continue;
    }

    await removeOrphan(path.join(home, orphan.relativePath), orphan.relativePath, removedPaths, options.dryRun);
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
