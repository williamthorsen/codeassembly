import { describeError } from '@williamthorsen/toolbelt.errors';

import { emitReport, printLine } from '../lib/emit-report.ts';
import { classifyOwnedEntry } from '../lib/entry-remover.ts';
import { resolveHarnessIds, resolveHarnessPaths } from '../lib/harness.ts';
import { removeItem } from '../lib/installer.ts';
import { getManifestPath, readManifest, writeManifest } from '../lib/manifest.ts';
import { removeRetiredHookEntries } from '../lib/retired-hook-entries.ts';
import { retireSharedGuidance, withoutSharedTier } from '../lib/shared-guidance-retirement.ts';
import type { AgentsManifest, InstallOptions, ManifestEntry } from '../lib/types.ts';

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

  // Retire the withdrawn `~/.agents/` tier ahead of the harness-detection return, so that a home that doesn't
  // target any harness is still cleared.
  const didRetire = await retireSharedGuidance(manifest, { force: options.force, dryRun: false }, baseDir);

  if (harnesses.length === 0) {
    if (didRetire) {
      await writeManifest(manifestPath, withoutSharedTier(manifest));
      console.info('\nManifest updated.');
    } else {
      console.info('No target harnesses detected. Nothing to uninstall.');
    }
    return;
  }

  let remainingHarnesses = { ...manifest.harnesses };

  for (const harnessId of harnesses) {
    console.info(`\nUninstalling for harness: ${harnessId}`);

    // Remove the hook entries regardless of manifest state: They live inside a shared user config rather than as
    // tracked files. An unparseable config stops the hook removal with a warning, never the removal of the tracked
    // items or the manifest update.
    try {
      emitReport(await removeRetiredHookEntries(harnessId, baseDir));
    } catch (error) {
      printLine({
        glyph: 'warning',
        indent: 2,
        level: 'warn',
        text: `Skipping hook-entry removal: ${describeError(error)}`,
      });
    }

    const harnessManifest = manifest.harnesses[harnessId];
    if (!harnessManifest) {
      console.info('  No installed items tracked for this harness.');
      continue;
    }

    const paths = resolveHarnessPaths(harnessId, baseDir);
    const skippedEntries = await removeTrackedEntries(harnessManifest.entries, paths.harnessHome, options.force);

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
    ...withoutSharedTier(manifest),
    harnesses: remainingHarnesses,
  };

  await writeManifest(manifestPath, updatedManifest);
  console.info('\nManifest updated.');
}

// region | Helpers

/**
 * Removes each tracked entry marked for removal by the policy, collects user-modified entries to keep tracking,
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
      printLine({ glyph: 'warning', indent: 2, level: 'warn', text: `Skipping modified file: ${entry.relativePath}` });
      skippedEntries.push(entry);
      continue;
    }

    if (verdict === 'remove') {
      await removeItem(`${home}/${entry.relativePath}`);
    }
    removedCount++;
  }

  printLine({
    glyph: 'passed',
    indent: 2,
    level: 'info',
    text: `Removed ${removedCount} items, skipped ${skippedEntries.length} modified items`,
  });
  return skippedEntries;
}

// endregion | Helpers
