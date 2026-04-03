import { removeItem } from '../lib/installer.js';
import { detectDrift, getManifestPath, readManifest, resolveSharedHome, writeManifest } from '../lib/manifest.js';
import { resolvePlatformIds, resolvePlatformPaths } from '../lib/platform.js';
import type { AgentsManifest, InstallOptions, SharedManifest } from '../lib/types.js';

/**
 * Executes the uninstall command, removing installed skills, subagents, and guidance files.
 */
export async function uninstallCommand(
  options: Pick<InstallOptions, 'platform' | 'force'>,
  baseDir?: string,
): Promise<void> {
  const manifestPath = getManifestPath(baseDir);
  const manifest = await readManifest(manifestPath);
  const platforms = resolvePlatformIds(options.platform, baseDir);

  // Uninstall shared guidance unconditionally (not gated by platform detection)
  const updatedShared = await uninstallSharedGuidance(manifest, options, baseDir);

  let remainingPlatforms = { ...manifest.platforms };

  if (platforms.length === 0 && !manifest.shared) {
    console.info('No target platforms detected. Nothing to uninstall.');
    return;
  }

  for (const platformId of platforms) {
    const platformManifest = manifest.platforms[platformId];
    if (!platformManifest) {
      console.info(`\nNo installation found for platform: ${platformId}`);
      continue;
    }

    console.info(`\nUninstalling for platform: ${platformId}`);
    const paths = resolvePlatformPaths(platformId, baseDir);
    let removedCount = 0;
    let skippedCount = 0;

    for (const entry of platformManifest.entries) {
      const drift = await detectDrift(entry, paths.platformHome);

      if (drift === 'missing') {
        // Already gone
        removedCount++;
        continue;
      }

      if (drift === 'modified' && !options.force) {
        console.warn(`  Skipping modified file: ${entry.relativePath}`);
        skippedCount++;
        continue;
      }

      const fullPath = `${paths.platformHome}/${entry.relativePath}`;
      await removeItem(fullPath);
      removedCount++;
    }

    // Only remove platform from manifest when all entries were successfully removed
    if (skippedCount === 0) {
      const { [platformId]: _removed, ...rest } = remainingPlatforms;
      remainingPlatforms = rest;
    }

    console.info(`  Removed ${removedCount} items, skipped ${skippedCount} modified items`);
  }

  const updatedManifest: AgentsManifest = {
    ...manifest,
    shared: updatedShared,
    platforms: remainingPlatforms,
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
  let skippedCount = 0;

  for (const entry of sharedManifest.entries) {
    const drift = await detectDrift(entry, sharedHome);

    if (drift === 'missing') {
      removedCount++;
      continue;
    }

    if (drift === 'modified' && !options.force) {
      console.warn(`  Skipping modified file: ~/.agents/${entry.relativePath}`);
      skippedCount++;
      continue;
    }

    const fullPath = `${sharedHome}/${entry.relativePath}`;
    await removeItem(fullPath);
    removedCount++;
  }

  console.info(`  Removed ${removedCount} items, skipped ${skippedCount} modified items`);

  // Retain shared manifest only if some entries were skipped
  if (skippedCount > 0) {
    return sharedManifest;
  }
  return undefined;
}
