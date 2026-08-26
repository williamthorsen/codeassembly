import { describeError } from '@williamthorsen/toolbelt.errors';

import { resolveHarnessIds, resolveHarnessPaths } from '../lib/harness.ts';
import { readHomeProvenance } from '../lib/home-provenance.ts';
import { detectDrift, getManifestPath, readManifest } from '../lib/manifest.ts';
import type { HarnessId, InstallOptions } from '../lib/types.ts';
import { checkHarnessHookEntries, type HookEntryStatus } from './configure-hooks.ts';

/**
 * Executes the status command, showing the current state of installed items.
 */
export async function statusCommand(options: Pick<InstallOptions, 'harness'>, baseDir?: string): Promise<void> {
  const manifestPath = getManifestPath(baseDir);
  const manifest = await readManifest(manifestPath);
  const harnesses = resolveHarnessIds(options.harness, baseDir);

  await reportHomeProvenance(baseDir);

  if (harnesses.length === 0) {
    console.info('No target harnesses detected.');
    return;
  }

  for (const harnessId of harnesses) {
    const harnessManifest = manifest.harnesses[harnessId];
    if (!harnessManifest) {
      console.info(`\n${harnessId}: not installed`);
      // Hook entries can exist without an install (configure-hooks alone); stay quiet only when there are none.
      await reportHookEntryStatus(harnessId, true, baseDir);
      continue;
    }

    console.info(`\n${harnessId}:`);
    console.info(`  Installed at: ${harnessManifest.installedAt}`);
    console.info(`  Version: ${harnessManifest.version}`);

    const paths = resolveHarnessPaths(harnessId, baseDir);
    let currentCount = 0;
    let modifiedCount = 0;
    let missingCount = 0;

    for (const entry of harnessManifest.entries) {
      const drift = await detectDrift(entry, paths.harnessHome);

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
    await reportHookEntryStatus(harnessId, false, baseDir);
  }
}

/**
 * Reports which installation last wrote the home domain, as one line. Stays silent where no stamp exists, since a
 * home domain last written by a build predating the stamp has nothing to report rather than something to warn about.
 */
async function reportHomeProvenance(baseDir?: string): Promise<void> {
  const provenance = await readHomeProvenance(baseDir);
  if (provenance === undefined) {
    return;
  }

  const commit = provenance.sourceCommit === undefined ? '' : ` @ ${provenance.sourceCommit.slice(0, 7)}`;
  console.info(
    `Home domain last written by ${provenance.version} at ${provenance.sourcePath}${commit} ` +
      `via \`${provenance.command}\` on ${provenance.writtenAt}`,
  );
}

/**
 * Reports the session-lifecycle hook entries' state in the harness's config file. When `quietWhenUnconfigured` is set
 * (the harness has no installation), an all-absent result prints nothing rather than noise about a feature not in use.
 */
async function reportHookEntryStatus(
  harnessId: HarnessId,
  quietWhenUnconfigured: boolean,
  baseDir?: string,
): Promise<void> {
  let statuses: ReadonlyArray<HookEntryStatus>;
  try {
    statuses = await checkHarnessHookEntries(harnessId, baseDir);
  } catch (error) {
    // An unparseable config is itself a status worth reporting; it must not abort the rest of the report.
    console.warn(`  ⚠️ Hooks: could not read the config: ${describeError(error)}`);
    return;
  }
  const presentCount = statuses.filter((entry) => entry.status === 'present').length;
  const driftedCount = statuses.filter((entry) => entry.status === 'drifted').length;
  const absentCount = statuses.filter((entry) => entry.status === 'absent').length;

  if (absentCount === statuses.length) {
    if (!quietWhenUnconfigured) {
      console.info('  Hooks: not configured');
    }
    return;
  }

  console.info(`  Hooks: ${presentCount} present, ${driftedCount} drifted, ${absentCount} absent`);
  for (const entry of statuses) {
    if (entry.status !== 'present') {
      console.info(`    ${entry.status}: ${entry.hook}`);
    }
  }
}
