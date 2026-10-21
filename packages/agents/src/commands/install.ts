import { homedir } from 'node:os';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { resolveDeclaration } from '../lib/codeassembly-manifest.ts';
import { describeMissingSource, NoContentSourceError, resolveDeclaredSources } from '../lib/declared-sources.ts';
import { emitReport, printLine } from '../lib/emit-report.ts';
import { describePruneResult, pruneOrphanedEntries } from '../lib/entry-remover.ts';
import { type AgentsGit, realGit } from '../lib/git.ts';
import { HARNESSES, resolveHarnessPaths } from '../lib/harness.ts';
import { recordFailedHomeAttempt, recordHomeProvenance } from '../lib/home-provenance.ts';
import { assertDesignatedWriter } from '../lib/home-writer-guard.ts';
import { checkSymlinkSafety } from '../lib/installer.ts';
import { getManifestPath, readManifest, writeManifest } from '../lib/manifest.ts';
import { removeRetiredHookEntries } from '../lib/retired-hook-entries.ts';
import { readRunningPackageVersion, resolveRunningPackageRoot } from '../lib/running-package.ts';
import { retireSharedGuidance, withoutSharedTier } from '../lib/shared-guidance-retirement.ts';
import { describeHarnessTargeting, resolveTargetHarnesses } from '../lib/target-harnesses.ts';
import type { AgentsManifest, HarnessId, HarnessManifest, InstallOptions, ManifestEntry } from '../lib/types.ts';
import { retractDroppedHarnesses } from './harness-retraction.ts';
import { installHarnessGuidance } from './install-harness-guidance.ts';
import { installScripts } from './install-scripts.ts';

/**
 * Executes the install command, installing skills and subagents for the specified harnesses.
 */
export async function installCommand(
  options: InstallOptions,
  baseDir?: string,
  git: AgentsGit = realGit,
): Promise<void> {
  // Runs first, and before the dry-run gate: A preview must refuse wherever the real run would. The attempt is
  // recorded only past this point, so an installation refused by the guard leaves the home domain's record untouched.
  await assertDesignatedWriter({
    command: 'install',
    homeDir: baseDir,
    packageRoot: resolveRunningPackageRoot(),
    shouldOverrideWriter: options.shouldOverrideWriter,
  });

  try {
    await deployHomeDomain(options, baseDir, git);
  } catch (error: unknown) {
    // A declaration without a usable source is refused before anything about the run is known, so it is not an attempt.
    if (!options.dryRun && !(error instanceof NoContentSourceError)) {
      await recordFailedHomeAttempt('install', { summary: describeError(error) }, baseDir);
    }
    throw error;
  }
}

/** Deploys the home domain, past the designated-writer guard that `installCommand` applies. */
async function deployHomeDomain(options: InstallOptions, baseDir: string | undefined, git: AgentsGit): Promise<void> {
  const homeDir = baseDir ?? homedir();
  // Resolve the home declaration's sources, which refuses a missing or unusable source, or a content root whose
  // declared format this tool cannot honor, before anything is written, dry-run included. `roots` is the search order
  // followed by every pass below that reads undeclared content: each declared source in precedence order.
  const { missingSources, roots } = await resolveDeclaredSources({
    baseDir: homeDir,
    declaration: await resolveDeclaration({ cwd: homeDir, domain: 'home' }),
  });
  emitReport(missingSources.map(describeMissingSource));

  const manifestPath = getManifestPath(baseDir);
  const manifest = await readManifest(manifestPath);
  // Both arguments are the home directory: `install` deploys into the harness homes, so its declaration chain is the
  // home tier pair alone. Passing a project root would let a repository decide where the home domain deploys.
  const targets = await resolveTargetHarnesses({ harness: options.harness, cwd: homeDir, homeDir });
  const harnesses = targets.harnessIds;
  console.info(describeHarnessTargeting(targets));

  // Retire the withdrawn shared-guidance tier unconditionally, ahead of the no-target return: A home that doesn't
  // target any harness still contains whatever a previous install left in `~/.agents/`.
  const didRetire = await retireSharedGuidance(manifest, options, baseDir);

  // Above the no-target return for the same reason: A declaration resolving to an empty set targets nothing, and the
  // run still has to clear what a previous run deployed.
  const retraction = await retractDroppedHarnesses({ manifest, targets, baseDir, install: options });
  emitReport(retraction.lines);

  if (harnesses.length === 0) {
    if (!options.dryRun && (didRetire || retraction.didRetract)) {
      await writeManifest(manifestPath, { ...withoutSharedTier(manifest), harnesses: retraction.harnesses });
      console.info('\nManifest updated.');
    } else {
      console.info('Nothing else to install.');
    }
    if (!options.dryRun) {
      await recordHomeProvenance('install', baseDir, git);
    }
    return;
  }

  const updatedHarnesses: Partial<Record<HarnessId, HarnessManifest>> = { ...retraction.harnesses };

  for (const harnessId of harnesses) {
    console.info(`\nInstalling for harness: ${harnessId}`);
    const paths = resolveHarnessPaths(harnessId, baseDir);

    checkSymlinkSafety(paths.skillsDir);
    checkSymlinkSafety(paths.subagentsDir);
    checkSymlinkSafety(paths.scriptsDir);

    const existingEntries = manifest.harnesses[harnessId]?.entries ?? [];
    const existingByPath = new Map(existingEntries.map((e) => [e.relativePath, e]));

    const entries: Array<ManifestEntry> = [];

    const harnessConfig = HARNESSES[harnessId];

    const scriptEntries = await installScripts(
      roots,
      paths.scriptsDir,
      paths.harnessHome,
      harnessConfig,
      existingByPath,
      options,
    );
    entries.push(...scriptEntries);

    // Remove the hook entries that earlier installs wrote, ahead of the orphan prune that deletes the relay script
    // which they invoke. Warn and continue when the config cannot be parsed: The manifest must still record what was
    // copied.
    try {
      emitReport(await removeRetiredHookEntries(harnessId, baseDir, options));
    } catch (error) {
      printLine({
        glyph: 'warning',
        indent: 2,
        level: 'warn',
        text: `Skipping hook-entry removal: ${describeError(error)}`,
      });
    }

    const guidanceEntries = await installHarnessGuidance(roots, paths, harnessId, existingByPath, options);
    entries.push(...guidanceEntries);

    // Reconcile against the previous manifest: Remove files whose source was deleted, and the support entries that an
    // earlier install deployed to the flat skills slot. Runs before the dry-run gate so that `--dry-run` previews
    // removals. User-modified orphans are kept (unless `--force`) and stay tracked.
    const pruned = await pruneOrphanedEntries(existingEntries, entries, paths.harnessHome, options);
    entries.push(...pruned.retained);
    emitReport(describePruneResult(pruned, options));

    if (options.dryRun) {
      console.info(`  [dry-run] Would install ${entries.length} items:`);
      console.info(`    ${scriptEntries.length} script items`);
      console.info(`    ${guidanceEntries.length} guidance items`);
      continue;
    }

    updatedHarnesses[harnessId] = {
      harness: harnessId,
      version: readRunningPackageVersion(),
      installedAt: new Date().toISOString(),
      entries,
    };
    printLine({
      glyph: 'passed',
      indent: 2,
      level: 'info',
      text: `Installed ${entries.length} items for ${harnessId}`,
    });
  }

  if (options.dryRun) return;

  const updatedManifest: AgentsManifest = {
    ...withoutSharedTier(manifest),
    harnesses: updatedHarnesses,
  };
  await writeManifest(manifestPath, updatedManifest);
  console.info('\nManifest updated.');
  await recordHomeProvenance('install', baseDir, git);
}
