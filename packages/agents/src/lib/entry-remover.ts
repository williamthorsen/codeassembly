import path from 'node:path';

import { removeItem } from './installer.ts';
import { detectDrift } from './manifest.ts';
import type { ReportLine } from './report-line.ts';
import type { ManifestEntry } from './types.ts';

/** Fate of an owned manifest entry during removal: delete it, keep it (user-modified, no force), or note it is already gone from disk. */
export type OwnedEntryVerdict = 'remove' | 'retain' | 'absent';

/** Options controlling orphan pruning, mirroring the install flags that govern it. */
interface PruneOptions {
  readonly force: boolean;
  readonly dryRun: boolean;
}

/** One orphan a prune pass considered, and the verdict it drew. */
export interface PrunedOrphan {
  readonly entry: ManifestEntry;
  readonly verdict: OwnedEntryVerdict;
}

/** Outcome of a prune pass: every orphan in the order considered, and the entries that stay tracked in the manifest. */
export interface PruneResult {
  readonly orphans: ReadonlyArray<PrunedOrphan>;
  readonly retained: ReadonlyArray<ManifestEntry>;
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

/** What a prune pass did with each orphan: the modified ones it kept, and the stale ones it removed. */
export function describePruneResult(result: PruneResult, options: { dryRun: boolean }): ReadonlyArray<ReportLine> {
  return result.orphans.flatMap((orphan): ReadonlyArray<ReportLine> => {
    switch (orphan.verdict) {
      case 'absent':
        return [];
      case 'retain':
        return [{ level: 'warn', text: `  ⚠️ Keeping modified stale item: ${orphan.entry.relativePath}` }];
      case 'remove':
        return [
          {
            level: 'info',
            text: options.dryRun
              ? `  [dry-run] Would remove stale item: ${orphan.entry.relativePath}`
              : `  🗑️ Removed stale item: ${orphan.entry.relativePath}`,
          },
        ];
    }
  });
}

/**
 * Removes installed files recorded in `previousEntries` whose source no longer exists — those whose
 * `relativePath` is absent from `currentEntries` — resolving paths against the install root `home`. Each
 * orphan's fate follows `classifyOwnedEntry`; a retained (user-modified, unforced) orphan stays tracked in
 * the manifest. In `dryRun`, each orphan draws its verdict but no file is removed.
 */
export async function pruneOrphanedEntries(
  previousEntries: ReadonlyArray<ManifestEntry>,
  currentEntries: ReadonlyArray<ManifestEntry>,
  home: string,
  options: PruneOptions,
): Promise<PruneResult> {
  const currentPaths = new Set(currentEntries.map((entry) => entry.relativePath));
  const candidates = previousEntries.filter((entry) => !currentPaths.has(entry.relativePath));

  const orphans: Array<PrunedOrphan> = [];
  for (const entry of candidates) {
    const verdict = await classifyOwnedEntry(entry, home, options.force);
    if (verdict === 'remove' && !options.dryRun) {
      await removeItem(path.join(home, entry.relativePath));
    }
    orphans.push({ entry, verdict });
  }

  return {
    orphans,
    retained: orphans.filter((orphan) => orphan.verdict === 'retain').map((orphan) => orphan.entry),
  };
}
