import { chmod, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { extractAmbientRegionContent, hasAmbientRegion, injectAmbientRegion } from '../lib/ambient-region.ts';
import { resolveDeclaration } from '../lib/codeassembly-manifest.ts';
import type { ContentRootRef } from '../lib/content-root-manifest.ts';
import {
  describeContentRoot,
  describeMissingSource,
  NoContentSourceError,
  resolveDeclaredSources,
} from '../lib/declared-sources.ts';
import { emitReport, printLine } from '../lib/emit-report.ts';
import { describePruneResult, pruneOrphanedEntries } from '../lib/entry-remover.ts';
import {
  listGuidanceTemplateFiles,
  renderGuidanceTemplateFile,
  resolveGuidanceTemplateDir,
} from '../lib/guidance-template.ts';
import { HARNESSES, resolveHarnessPaths } from '../lib/harness.ts';
import { recordFailedHomeAttempt, recordHomeProvenance } from '../lib/home-provenance.ts';
import { assertDesignatedWriter } from '../lib/home-writer-guard.ts';
import { checkSymlinkSafety, copyItem, linkItem, unlinkIfSymlink } from '../lib/installer.ts';
import { computeContentHash, detectDrift, getManifestPath, readManifest, writeManifest } from '../lib/manifest.ts';
import type { ReportLine } from '../lib/report-line.ts';
import { readRunningPackageVersion, resolveRunningPackageRoot } from '../lib/running-package.ts';
import { retireSharedGuidance, withoutSharedTier } from '../lib/shared-guidance-retirement.ts';
import { describeHarnessTargeting, resolveTargetHarnesses } from '../lib/target-harnesses.ts';
import { isEnoent } from '../lib/type-guards.ts';
import type {
  AgentsManifest,
  HarnessConfig,
  HarnessId,
  HarnessManifest,
  InstallOptions,
  ManifestEntry,
} from '../lib/types.ts';
import { ensureHarnessHookEntries } from './configure-hooks.ts';
import { retractDroppedHarnesses } from './harness-retraction.ts';

/**
 * The extensions that ship from `content/scripts/` to a harness home: `.sh` shell helpers and `.mjs` TypeScript
 * bundles, either kind invoked by a skill, a subagent, or the harness itself. Anything else there (the README)
 * documents the directory rather than shipping from it.
 */
const SCRIPT_EXTENSIONS: ReadonlyArray<string> = ['.mjs', '.sh'];

/** One content root shipping a harness's guidance template, and the file names that it installs from there. */
interface TemplateRoot {
  readonly root: ContentRootRef;
  readonly fileNames: ReadonlyArray<string>;
}

/**
 * Executes the install command, installing skills and subagents for the specified harnesses.
 */
export async function installCommand(options: InstallOptions, baseDir?: string): Promise<void> {
  // Runs first, and before the dry-run gate: A preview must refuse wherever the real run would. The attempt is
  // recorded only past this point, so an installation refused by the guard leaves the home domain's record untouched.
  await assertDesignatedWriter({
    command: 'install',
    homeDir: baseDir,
    packageRoot: resolveRunningPackageRoot(),
    shouldOverrideWriter: options.shouldOverrideWriter,
  });

  try {
    await deployHomeDomain(options, baseDir);
  } catch (error: unknown) {
    // A declaration without a usable source is refused before anything about the run is known, so it is not an attempt.
    if (!options.dryRun && !(error instanceof NoContentSourceError)) {
      await recordFailedHomeAttempt('install', { summary: describeError(error) }, baseDir);
    }
    throw error;
  }
}

/** Deploys the home domain, past the designated-writer guard that `installCommand` applies. */
async function deployHomeDomain(options: InstallOptions, baseDir: string | undefined): Promise<void> {
  const homeDir = baseDir ?? homedir();
  // Resolve the home declaration's sources, which refuses a missing or unusable source, or a content root whose
  // declared format this tool cannot honor, before anything is written, dry-run included. `roots` is the search order
  // followed by every pass below that reads undeclared content: each declared source in precedence order.
  const { missingSources, roots } = await resolveDeclaredSources({
    baseDir: homeDir,
    declaration: await resolveDeclaration({ cwd: homeDir, domain: 'home' }),
    domain: 'home',
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

  // Above the no-target return for the same reason: A declaration resolving to an empty set targets nothing and still
  // has to clear what a previous run deployed.
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
      await recordHomeProvenance('install', baseDir);
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

    // Wire the session-lifecycle hook entries once the relay script is in place, so that the configured commands point
    // at a script that exists. `--skip-hooks` leaves the harness config untouched. Warn and continue when the config
    // cannot be parsed: The manifest must still record what was copied.
    if (options.hooks !== false) {
      if (options.dryRun) {
        console.info('    [hooks] Would wire session-lifecycle hook entries');
      } else {
        try {
          await ensureHarnessHookEntries(harnessId, baseDir);
        } catch (error) {
          printLine({
            glyph: 'warning',
            indent: 2,
            level: 'warn',
            text: `Skipping hook wiring: ${describeError(error)} (fix the config, then run configure-hooks)`,
          });
        }
      }
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

  if (!options.dryRun) {
    const updatedManifest: AgentsManifest = {
      ...withoutSharedTier(manifest),
      harnesses: updatedHarnesses,
    };
    await writeManifest(manifestPath, updatedManifest);
    console.info('\nManifest updated.');
    await recordHomeProvenance('install', baseDir);
  }
}

/**
 * Installs script files from every content root's `scripts/` directory into the target scripts directory.
 * Scripts are flat files without frontmatter or harness-specific variants, so the roots merge by file name rather than
 * one root owning the directory.
 * Copied scripts receive the executable bit (0o755); symlinked scripts inherit the source's permissions.
 */
async function installScripts(
  roots: ReadonlyArray<ContentRootRef>,
  scriptsDestDir: string,
  harnessHome: string,
  harnessConfig: HarnessConfig,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
): Promise<ReadonlyArray<ManifestEntry>> {
  const { claims, foundDirectory, warnings } = await collectScriptClaims(roots);
  emitReport(warnings);
  if (!foundDirectory) {
    printLine({
      glyph: 'warning',
      indent: 2,
      level: 'warn',
      text: "The content roots don't contain a scripts directory, skipping script installation",
    });
    return [];
  }

  const entries: Array<ManifestEntry> = [];

  for (const [entry, srcPath] of claims) {
    const destPath = path.join(scriptsDestDir, entry);
    const relativePath = `${harnessConfig.scriptsDirName}/${entry}`;

    if (options.dryRun) {
      const action = options.link ? 'link' : 'copy';
      console.info(`    [${action}] ${relativePath}`);
      entries.push({ relativePath, contentHash: 'dry-run', linked: options.link });
      continue;
    }

    const existingEntry = existingByPath.get(relativePath);
    if (existingEntry && !options.force) {
      const drift = await detectDrift(existingEntry, harnessHome);
      if (drift === 'modified') {
        printLine({ glyph: 'warning', indent: 2, level: 'warn', text: `Skipping modified item: ${relativePath}` });
        entries.push(existingEntry);
        continue;
      }
    }

    await (options.link ? linkItem(srcPath, destPath) : copyItem(srcPath, destPath));

    if (!options.link) {
      await chmod(destPath, 0o755);
    }

    // Compute hash from source for symlinked scripts (dest symlink may not resolve in all environments)
    const hashPath = options.link ? srcPath : destPath;
    entries.push({
      relativePath,
      contentHash: await computeContentHash(hashPath),
      linked: options.link,
    });
  }

  return entries;
}

/**
 * Installs harness-specific guidance files from `content/guidance/_harnesses/{harnessId}/` into the harness
 * home directory. Harness guidance is always copied and rewritten (never symlinked), because install-time path
 * rewriting produces absolute link targets that agents can resolve without knowing a path convention.
 */
async function installHarnessGuidance(
  roots: ReadonlyArray<ContentRootRef>,
  harnessPaths: { harnessHome: string },
  harnessId: HarnessId,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
): Promise<ReadonlyArray<ManifestEntry>> {
  const harnessConfig = HARNESSES[harnessId];
  const shippingRoots = await findTemplateRoots(roots, harnessId);
  const owner = shippingRoots.at(0);
  if (owner === undefined) {
    printLine({
      glyph: 'warning',
      indent: 2,
      level: 'warn',
      text: `The content roots don't contain a ${harnessId} guidance directory, skipping harness guidance installation`,
    });
    return [];
  }
  const shadowed = shippingRoots.slice(1);
  if (shadowed.length > 0) {
    emitReport([
      {
        glyph: 'warning',
        indent: 2,
        level: 'warn',
        text:
          `The ${harnessId} guidance template is shipped by more than one content root: installing it from ` +
          `${describeContentRoot(owner.root)} and ignoring ${shadowed.map((shipping) => describeContentRoot(shipping.root)).join(', ')}.`,
      },
    ]);
  }

  const guidanceSrcDir = resolveGuidanceTemplateDir(owner.root.dir, harnessId);

  const entries: Array<ManifestEntry> = [];

  for (const entry of owner.fileNames) {
    const srcPath = path.join(guidanceSrcDir, entry);
    const destPath = path.join(harnessPaths.harnessHome, entry);

    // Render before the dry-run gate so that missing include targets, cycles, out-of-tree references, malformed hooks,
    // and dead in-body locators surface even when the dry run doesn't write any files.
    const renderedContent = entry.endsWith('.md')
      ? await renderGuidanceTemplateFile(owner.root, harnessId, entry)
      : undefined;

    if (options.dryRun) {
      console.info(`    [copy] ${entry} (guidance)`);
      entries.push({ relativePath: entry, contentHash: 'dry-run', linked: false });
      continue;
    }

    const existingEntry = existingByPath.get(entry);
    if (existingEntry && !options.force) {
      const drift = await detectDrift(existingEntry, harnessPaths.harnessHome);
      if (drift === 'modified') {
        printLine({
          glyph: 'warning',
          indent: 2,
          level: 'warn',
          text: `Skipping modified item: ${harnessConfig.homeDir}/${entry}`,
        });
        entries.push(existingEntry);
        continue;
      }
    }

    // The wholesale re-render below would drop whatever sync wrote into the ambient region, so capture the existing
    // destination's region content first; it is spliced back once the fresh render is in place.
    const preservedAmbient = entry.endsWith('.md') ? await readAmbientRegionContent(destPath) : undefined;

    await unlinkIfSymlink(destPath);
    if (renderedContent === undefined) {
      await copyItem(srcPath, destPath);
    } else {
      // Splice the preserved region content into the fresh render. The region's location comes from the template;
      // its content belongs to sync and must survive an install. A template that no longer contains the region takes
      // precedence: The content is dropped and the next `sync` re-delivers or warns.
      const shouldSplice =
        preservedAmbient !== undefined && preservedAmbient !== '' && hasAmbientRegion(renderedContent);
      await writeFile(
        destPath,
        shouldSplice ? injectAmbientRegion(renderedContent, preservedAmbient) : renderedContent,
        'utf8',
      );
    }

    entries.push({
      relativePath: entry,
      contentHash: await computeContentHash(destPath),
      linked: false,
    });
  }

  return entries;
}

/**
 * Collects the installable scripts across `roots`, keyed by file name, taking each name from the highest-precedence
 * root that ships it. A name also shipped by a lower-precedence root is dropped and reported: Scripts deploy into one
 * flat directory, and their file names are undeclared, so a collision states none of the override intent that a
 * declared artifact's slug does.
 *
 * `foundDirectory` distinguishes a run in which the roots don't ship any `scripts/` directory at all from one in which
 * the directories exist and hold nothing installable, because only the first is worth a warning.
 */
async function collectScriptClaims(roots: ReadonlyArray<ContentRootRef>): Promise<{
  claims: ReadonlyMap<string, string>;
  foundDirectory: boolean;
  warnings: ReadonlyArray<ReportLine>;
}> {
  const claims = new Map<string, string>();
  const claimants = new Map<string, ContentRootRef>();
  const warnings: Array<ReportLine> = [];
  let foundDirectory = false;

  for (const root of roots) {
    const scriptsSrcDir = path.join(root.dir, 'scripts');
    let dirEntries: ReadonlyArray<string>;
    try {
      dirEntries = await readdir(scriptsSrcDir);
    } catch (error: unknown) {
      if (!isEnoent(error)) {
        throw error;
      }
      continue;
    }
    foundDirectory = true;

    for (const entry of dirEntries) {
      if (entry.startsWith('.')) {
        continue;
      }

      if (SCRIPT_EXTENSIONS.every((extension) => !entry.endsWith(extension))) {
        continue;
      }

      const srcPath = path.join(scriptsSrcDir, entry);

      if (!(await stat(srcPath)).isFile()) {
        continue;
      }

      const claimant = claimants.get(entry);
      if (claimant !== undefined) {
        warnings.push({
          glyph: 'warning',
          indent: 2,
          level: 'warn',
          text:
            `Script ${entry} is shipped by more than one content root: installing it from ` +
            `${describeContentRoot(claimant)} and ignoring ${describeContentRoot(root)}.`,
        });
        continue;
      }
      claims.set(entry, srcPath);
      claimants.set(entry, root);
    }
  }

  return { claims, foundDirectory, warnings };
}

/**
 * Reports the roots shipping a guidance template for `harnessId`, highest precedence first, each paired with the file
 * names that it installs. A root ships a template when its `guidance/_harnesses/<harnessId>/` directory holds at least
 * one such file; a directory that is absent, or holds only dotfiles and subdirectories, ships nothing, so it cannot
 * shadow the root that would otherwise supply the harness.
 *
 * The file names are returned with the root so that selection and installation apply one definition of an installable
 * entry. Because `copyItem` copies a directory recursively and `computeContentHash` reads a file, an entry that the
 * two passes classified differently would be written to the harness home and then fail the hash that records it.
 *
 * Ownership is whole-directory rather than per file, which is what keeps the template's `guidance/shared/AGENTS.md`
 * include resolving inside the one root from which the template came.
 */
async function findTemplateRoots(
  roots: ReadonlyArray<ContentRootRef>,
  harnessId: HarnessId,
): Promise<ReadonlyArray<TemplateRoot>> {
  const shipping: Array<TemplateRoot> = [];
  for (const root of roots) {
    const fileNames = await listGuidanceTemplateFiles(root.dir, harnessId);
    if (fileNames.length > 0) {
      shipping.push({ root, fileNames });
    }
  }
  return shipping;
}

/**
 * Reads the ambient-region content of the file at `filePath`, returning `undefined` when the file is absent or
 * doesn't contain a complete region.
 */
async function readAmbientRegionContent(filePath: string): Promise<string | undefined> {
  try {
    return extractAmbientRegionContent(await readFile(filePath, 'utf8'));
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return undefined;
    }
    throw error;
  }
}
