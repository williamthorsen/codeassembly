import { removeItem } from '../lib/installer.js';
import { detectDrift, getManifestPath, readManifest, writeManifest } from '../lib/manifest.js';
import { resolvePlatformIds, resolvePlatformPaths } from '../lib/platform.js';
import type { AgentsManifest, InstallOptions } from '../lib/types.js';

/**
 * Executes the uninstall command, removing installed skills and subagents.
 */
export async function uninstallCommand(
  options: Pick<InstallOptions, 'platform' | 'force'>,
  baseDir?: string,
): Promise<void> {
  const manifestPath = getManifestPath(baseDir);
  const manifest = await readManifest(manifestPath);
  const platforms = resolvePlatformIds(options.platform, baseDir);

  if (platforms.length === 0) {
    console.info('No target platforms detected. Nothing to uninstall.');
    return;
  }

  let remainingPlatforms = { ...manifest.platforms };

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
    platforms: remainingPlatforms,
  };

  await writeManifest(manifestPath, updatedManifest);
  console.info('\nManifest updated.');
}
