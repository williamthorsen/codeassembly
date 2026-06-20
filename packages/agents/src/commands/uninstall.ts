import { resolveHarnessIds, resolveHarnessPaths } from '../lib/harness.js';
import { removeItem } from '../lib/installer.js';
import { detectDrift, getManifestPath, readManifest, resolveSharedHome, writeManifest } from '../lib/manifest.js';
import type { AgentsManifest, InstallOptions, ManifestEntry, SharedManifest } from '../lib/types.js';

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

  // Uninstall shared guidance unconditionally (not gated by harness detection)
  const updatedShared = await uninstallSharedGuidance(manifest, options, baseDir);

  let remainingHarnesses = { ...manifest.harnesses };

  // uninstallSharedGuidance above is a no-op when manifest.shared is undefined,
  // so this guard safely covers the "nothing installed at all" case.
  if (harnesses.length === 0 && !manifest.shared) {
    console.info('No target harnesses detected. Nothing to uninstall.');
    return;
  }

  for (const harnessId of harnesses) {
    const harnessManifest = manifest.harnesses[harnessId];
    if (!harnessManifest) {
      console.info(`\nNo installation found for harness: ${harnessId}`);
      continue;
    }

    console.info(`\nUninstalling for harness: ${harnessId}`);
    const paths = resolveHarnessPaths(harnessId, baseDir);
    let removedCount = 0;
    const skippedEntries: ManifestEntry[] = [];

    for (const entry of harnessManifest.entries) {
      const drift = await detectDrift(entry, paths.harnessHome);

      if (drift === 'missing') {
        // Already gone
        removedCount++;
        continue;
      }

      if (drift === 'modified' && !options.force) {
        console.warn(`  ⚠️ Skipping modified file: ${entry.relativePath}`);
        skippedEntries.push(entry);
        continue;
      }

      const fullPath = `${paths.harnessHome}/${entry.relativePath}`;
      await removeItem(fullPath);
      removedCount++;
    }

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

    console.info(`  ✅ Removed ${removedCount} items, skipped ${skippedEntries.length} modified items`);
  }

  const updatedManifest: AgentsManifest = {
    ...manifest,
    shared: updatedShared,
    harnesses: remainingHarnesses,
  };

  await writeManifest(manifestPath, updatedManifest);
  console.info('\nManifest updated.');
}

/**
 * Uninstalls shared guidance files from `~/.agents/`.
 * Returns the updated shared manifest (undefined if all entries were removed).
 */
async function uninstallSharedGuidance(
  manifest: AgentsManifest,
  options: Pick<InstallOptions, 'force'>,
  baseDir?: string,
): Promise<SharedManifest | undefined> {
  const sharedManifest = manifest.shared;
  if (!sharedManifest) {
    return undefined;
  }

  console.info('\nUninstalling shared guidance');
  const sharedHome = resolveSharedHome(baseDir);
  let removedCount = 0;
  const skippedEntries: ManifestEntry[] = [];

  for (const entry of sharedManifest.entries) {
    const drift = await detectDrift(entry, sharedHome);

    if (drift === 'missing') {
      removedCount++;
      continue;
    }

    if (drift === 'modified' && !options.force) {
      console.warn(`  ⚠️ Skipping modified file: ~/.agents/${entry.relativePath}`);
      skippedEntries.push(entry);
      continue;
    }

    const fullPath = `${sharedHome}/${entry.relativePath}`;
    await removeItem(fullPath);
    removedCount++;
  }

  console.info(`  ✅ Removed ${removedCount} items, skipped ${skippedEntries.length} modified items`);

  // Retain shared manifest only with the entries that were skipped
  if (skippedEntries.length > 0) {
    return { ...sharedManifest, entries: skippedEntries };
  }
  return undefined;
}
