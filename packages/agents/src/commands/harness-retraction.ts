import { describeError } from '@williamthorsen/toolbelt.errors';

import { describePruneResult, pruneOrphanedEntries } from '../lib/entry-remover.ts';
import { ALL_HARNESS_IDS, resolveHarnessPaths } from '../lib/harness.ts';
import type { ReportLine } from '../lib/report-line.ts';
import type { ResolvedHarnessTargets } from '../lib/target-harnesses.ts';
import type { AgentsManifest, HarnessId, HarnessManifest, InstallOptions } from '../lib/types.ts';
import { removeHarnessHookEntries } from './configure-hooks.ts';

/** The harness map a retraction pass leaves behind, and what it did to reach it. */
export interface HarnessRetractionResult {
  readonly harnesses: Partial<Record<HarnessId, HarnessManifest>>;
  readonly lines: ReadonlyArray<ReportLine>;
  /** Whether the pass changed anything, which is what tells a no-target run that its manifest still needs writing. */
  readonly didRetract: boolean;
}

/**
 * Removes what a previous `install` deployed to each harness the manifest tracks but this run no longer targets, and
 * unwires that harness's session-lifecycle hook entries. Returns the harness map the caller writes to the manifest.
 *
 * Retraction follows the declaration alone. Under `flag`, `--harness claude` names the run's target rather than
 * declaring rovo unwanted; under `detection`, a harness detection misses has no home directory holding stale files.
 * Either origin returns the manifest's harness map untouched.
 *
 * Each dropped harness runs through the same orphan prune the per-harness install pass runs, with an empty desired
 * set, so a user-modified file survives without `--force` and `--dry-run` previews the removals. A harness the prune
 * keeps entries for stays in the map tracking those alone; one with nothing kept loses its key.
 */
export async function retractDroppedHarnesses(options: {
  readonly manifest: AgentsManifest;
  readonly targets: ResolvedHarnessTargets;
  readonly baseDir: string | undefined;
  readonly install: Pick<InstallOptions, 'dryRun' | 'force' | 'hooks'>;
}): Promise<HarnessRetractionResult> {
  let harnesses: Partial<Record<HarnessId, HarnessManifest>> = { ...options.manifest.harnesses };
  if (options.targets.origin !== 'declaration') {
    return { harnesses, lines: [], didRetract: false };
  }

  const targeted = new Set(options.targets.harnessIds);
  const lines: Array<ReportLine> = [];
  let didRetract = false;

  for (const harnessId of ALL_HARNESS_IDS) {
    const harnessManifest = harnesses[harnessId];
    if (targeted.has(harnessId) || harnessManifest === undefined) {
      continue;
    }

    const paths = resolveHarnessPaths(harnessId, options.baseDir);
    const pruned = await pruneOrphanedEntries(harnessManifest.entries, [], paths.harnessHome, options.install);
    lines.push(
      { level: 'info', text: `\nRetracting harness dropped from the declaration: ${harnessId}` },
      ...describePruneResult(pruned, options.install),
      ...(await unwireHooks(harnessId, options.baseDir, options.install)),
    );

    didRetract = true;
    if (pruned.retained.length === 0) {
      const { [harnessId]: _retracted, ...remaining } = harnesses;
      harnesses = remaining;
      continue;
    }
    harnesses = { ...harnesses, [harnessId]: { ...harnessManifest, entries: pruned.retained } };
  }

  return { harnesses, lines, didRetract };
}

// region | Helpers

/**
 * Removes the harness's session-lifecycle hook entries, so its config stops invoking a relay script this pass has just
 * deleted. An unparseable config costs the unwiring a warning rather than the file removals it accompanies.
 */
async function unwireHooks(
  harnessId: HarnessId,
  baseDir: string | undefined,
  install: Pick<InstallOptions, 'dryRun' | 'hooks'>,
): Promise<ReadonlyArray<ReportLine>> {
  if (install.hooks === false) {
    return [];
  }
  if (install.dryRun) {
    return [{ level: 'info', text: '  [hooks] Would remove session-lifecycle hook entries' }];
  }

  try {
    await removeHarnessHookEntries(harnessId, baseDir);
  } catch (error) {
    return [{ level: 'warn', text: `  ⚠️ Skipping hook-entry removal: ${describeError(error)}` }];
  }
  return [];
}

// endregion | Helpers
