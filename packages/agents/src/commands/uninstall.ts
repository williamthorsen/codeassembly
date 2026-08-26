import { describeError } from '@williamthorsen/toolbelt.errors';

import { classifyOwnedEntry } from '../lib/entry-remover.ts';
import { resolveHarnessIds, resolveHarnessPaths } from '../lib/harness.ts';
import { removeItem } from '../lib/installer.ts';
import { getManifestPath, readManifest, writeManifest } from '../lib/manifest.ts';
import type { AgentsManifest, InstallOptions, ManifestEntry } from '../lib/types.ts';
import { removeHarnessHookEntries } from './configure-hooks.ts';

/**
 * Executes the uninstall command, removing installed skills, subagents, and guidance files.
 */
export async function uninstallCommand(
  options: Pick<InstallOptions, 'harness' | 'force'>,
  baseDir?: string,
): Promise<void> {
  const manifestPath = getManifestPath(baseDir);
  const manifest = await readManifest(manifestPath);
  const harnesses = resolveHarnessIds(options.harness, baseDir);

  if (harnesses.length === 0) {
    console.info('No target harnesses detected. Nothing to uninstall.');
    return;
  }

  let remainingHarnesses = { ...manifest.harnesses };

  for (const harnessId of harnesses) {
    console.info(`\nUninstalling for harness: ${harnessId}`);

    // Remove the hook entries regardless of manifest state: they live inside a shared user config rather than as
    // tracked files, and configure-hooks can have written them without an install. An unparseable config costs the
    // hook removal a warning, never the removal of the tracked items or the manifest update.
    try {
      await removeHarnessHookEntries(harnessId, baseDir);
    } catch (error) {
      console.warn(`  ⚠️ Skipping hook-entry removal: ${describeError(error)}`);
    }

    const harnessManifest = manifest.harnesses[harnessId];
    if (!harnessManifest) {
      console.info('  No installed items tracked for this harness.');
      continue;
    }

    const paths = resolveHarnessPaths(harnessId, baseDir);
    const skippedEntries = await removeTrackedEntries(harnessManifest.entries, paths.harnessHome, options.force);

    // Remove harness from manifest or retain only skipped entries
    if (skippedEntries.length === 0) {
      const { [harnessId]: _removed, ...rest } = remainingHarnesses;
      remainingHarnesses = rest;
    } else {
      remainingHarnesses = {
        ...remainingHarnesses,
        [harnessId]: { ...harnessManifest, entries: skippedEntries },
      };
    }
  }

  const updatedManifest: AgentsManifest = {
    ...manifest,
    harnesses: remainingHarnesses,
  };

  await writeManifest(manifestPath, updatedManifest);
  console.info('\nManifest updated.');
}

// region | Helpers

/**
 * Removes each tracked entry the policy marks for removal, collects user-modified entries to keep tracking,
 * reports the tally, and returns the skipped entries.
 */
async function removeTrackedEntries(
  entries: ReadonlyArray<ManifestEntry>,
  home: string,
  force: boolean,
): Promise<ManifestEntry[]> {
  let removedCount = 0;
  const skippedEntries: ManifestEntry[] = [];

  for (const entry of entries) {
    const verdict = await classifyOwnedEntry(entry, home, force);

    if (verdict === 'retain') {
      console.warn(`  ⚠️ Skipping modified file: ${entry.relativePath}`);
      skippedEntries.push(entry);
      continue;
    }

    if (verdict === 'remove') {
      await removeItem(`${home}/${entry.relativePath}`);
    }
    removedCount++;
  }

  console.info(`  ✅ Removed ${removedCount} items, skipped ${skippedEntries.length} modified items`);
  return skippedEntries;
}

// endregion | Helpers
