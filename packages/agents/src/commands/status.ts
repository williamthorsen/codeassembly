import { detectDrift, getManifestPath, readManifest } from '../lib/manifest.js';
import { resolvePlatformIds, resolvePlatformPaths } from '../lib/platform.js';
import type { InstallOptions } from '../lib/types.js';

/**
 * Executes the status command, showing the current state of installed items.
 */
export async function statusCommand(options: Pick<InstallOptions, 'platform'>, baseDir?: string): Promise<void> {
  const manifestPath = getManifestPath(baseDir);
  const manifest = await readManifest(manifestPath);
  const platforms = resolvePlatformIds(options.platform, baseDir);

  if (platforms.length === 0) {
    console.info('No target platforms detected.');
    return;
  }

  for (const platformId of platforms) {
    const platformManifest = manifest.platforms[platformId];
    if (!platformManifest) {
      console.info(`\n${platformId}: not installed`);
      continue;
    }

    console.info(`\n${platformId}:`);
    console.info(`  Installed at: ${platformManifest.installedAt}`);
    console.info(`  Version: ${platformManifest.version}`);

    const paths = resolvePlatformPaths(platformId, baseDir);
    let currentCount = 0;
    let modifiedCount = 0;
    let missingCount = 0;

    for (const entry of platformManifest.entries) {
      const drift = await detectDrift(entry, paths.platformHome);

      switch (drift) {
        case 'current':
          currentCount++;
          break;
        case 'modified':
          modifiedCount++;
          console.info(`    modified: ${entry.relativePath}`);
          break;
        case 'missing':
          missingCount++;
          console.info(`    missing:  ${entry.relativePath}`);
          break;
      }
    }

    console.info(`  Summary: ${currentCount} current, ${modifiedCount} modified, ${missingCount} missing`);
  }
}
