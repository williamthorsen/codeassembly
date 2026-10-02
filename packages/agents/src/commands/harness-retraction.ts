import { describeError } from '@williamthorsen/toolbelt.errors';

import { describePruneResult, pruneOrphanedEntries } from '../lib/entry-remover.ts';
import { ALL_HARNESS_IDS, resolveHarnessPaths } from '../lib/harness.ts';
import type { ReportLine } from '../lib/report-line.ts';
import { removeRetiredHookEntries } from '../lib/retired-hook-entries.ts';
import type { ResolvedHarnessTargets } from '../lib/target-harnesses.ts';
import type { AgentsManifest, HarnessId, HarnessManifest, InstallOptions } from '../lib/types.ts';

/** The harness map that a retraction pass leaves behind, and what it did to reach it. */
export interface HarnessRetractionResult {
  readonly harnesses: Partial<Record<HarnessId, HarnessManifest>>;
  readonly lines: ReadonlyArray<ReportLine>;
  /** Whether the pass changed anything, which is what tells a no-target run that its manifest still needs writing. */
  readonly didRetract: boolean;
}

/**
 * Removes what a previous `install` deployed to each harness that the manifest tracks but this run no longer targets,
 * and removes that harness's retired session-lifecycle hook entries. Returns the harness map that the caller writes to the
 * manifest.
 *
 * Retraction follows the declaration alone. A `flag` origin names the run's target without declaring any harness
 * unwanted, and a harness missed by `detection` doesn't have a home directory holding stale files; under either, the
 * pass returns the manifest's harness map untouched.
 *
 * Each dropped harness runs through the same orphan prune that the per-harness install pass runs, with an empty
 * desired set, so a user-modified file survives without `--force` and `--dry-run` previews the removals. A harness for
 * which the prune keeps entries stays in the map tracking those alone; one with nothing kept loses its key.
 */
export async function retractDroppedHarnesses(options: {
  readonly manifest: AgentsManifest;
  readonly targets: ResolvedHarnessTargets;
  readonly baseDir: string | undefined;
  readonly install: Pick<InstallOptions, 'dryRun' | 'force'>;
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
      ...(await removeHooks(harnessId, options.baseDir, options.install)),
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
 * Removes the harness's retired session-lifecycle hook entries. Reports a warning when the config cannot be parsed,
 * and does not fail the retraction.
 */
async function removeHooks(
  harnessId: HarnessId,
  baseDir: string | undefined,
  install: Pick<InstallOptions, 'dryRun'>,
): Promise<ReadonlyArray<ReportLine>> {
  if (install.dryRun) {
    return [{ level: 'info', text: '  [hooks] Would remove retired session-lifecycle hook entries' }];
  }

  try {
    await removeRetiredHookEntries(harnessId, baseDir);
  } catch (error) {
    return [
      { glyph: 'warning', indent: 2, level: 'warn', text: `Skipping hook-entry removal: ${describeError(error)}` },
    ];
  }
  return [];
}

// endregion | Helpers
