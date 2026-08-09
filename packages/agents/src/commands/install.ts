import { chmod, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { extractAmbientRegionContent, hasAmbientRegion, injectAmbientRegion } from '../lib/ambient-region.ts';
import { assertAnchorsResolve } from '../lib/anchor-resolution.ts';
import { resolveContentDir } from '../lib/content-resolver.ts';
import { expandIncludes } from '../lib/directive-expander.ts';
import { emitReport } from '../lib/emit-report.ts';
import { describePruneResult, pruneOrphanedEntries } from '../lib/entry-remover.ts';
import { stripGuidanceHooks } from '../lib/guidance-hooks.ts';
import { HARNESSES, resolveHarnessIds, resolveHarnessPaths, resolveSkillsPathPrefix } from '../lib/harness.js';
import { loadHarnessOverlay } from '../lib/harness-overlay.ts';
import { recordHomeProvenance } from '../lib/home-provenance.ts';
import { assertDesignatedWriter } from '../lib/home-writer-guard.ts';
import { checkSymlinkSafety, copyItem, linkItem, removeItem, unlinkIfSymlink } from '../lib/installer.ts';
import { listSupportEntries } from '../lib/library-catalog.ts';
import {
  computeContentHash,
  detectDrift,
  getManifestPath,
  readManifest,
  resolveSharedHome,
  writeManifest,
} from '../lib/manifest.js';
import { buildSourceUrl, injectMarkerInFile, injectMarkersInDirectory } from '../lib/marker-injector.js';
import { homeAnchor, rewritePathsInFile } from '../lib/path-rewriter.js';
import { readRunningPackageVersion, resolveRunningPackageRoot } from '../lib/running-package.ts';
import { type RenderedSkillEntry, renderSupportEntry } from '../lib/skill-transform.ts';
import { loadToolMapping } from '../lib/tool-name-rewriter.js';
import { isEnoent } from '../lib/type-guards.ts';
import type {
  AgentsManifest,
  HarnessConfig,
  HarnessId,
  HarnessManifest,
  InstallOptions,
  ManifestEntry,
  SharedManifest,
} from '../lib/types.js';
import { ensureHarnessHookEntries } from './configure-hooks.ts';

/**
 * The extensions that ship from `content/scripts/` to a harness home: `.sh` helpers a skill invokes, and `.mjs` bundles
 * the harness itself invokes. Anything else there — the README — documents the directory rather than shipping from it.
 */
const SCRIPT_EXTENSIONS: ReadonlyArray<string> = ['.mjs', '.sh'];

/**
 * Executes the install command, installing skills and subagents for the specified harnesses.
 */
export async function installCommand(
  options: InstallOptions,
  baseDir?: string,
  contentDirOverride?: string,
): Promise<void> {
  // Runs first, and before the dry-run gate: a preview must refuse wherever the real run would.
  await assertDesignatedWriter({
    command: 'install',
    homeDir: baseDir,
    packageRoot: resolveRunningPackageRoot(),
    shouldOverrideWriter: options.shouldOverrideWriter,
  });

  const contentDir = contentDirOverride ?? resolveContentDir();
  const manifestPath = getManifestPath(baseDir);
  const manifest = await readManifest(manifestPath);
  const harnesses = resolveHarnessIds(options.harness, baseDir);

  // Install shared guidance unconditionally (before harness detection check)
  const sharedGuidanceResult = await installSharedGuidance(contentDir, manifest, options, baseDir);

  if (harnesses.length === 0) {
    // Even with no harnesses, persist the shared manifest update
    if (!options.dryRun && sharedGuidanceResult) {
      const updatedManifest: AgentsManifest = {
        ...manifest,
        shared: sharedGuidanceResult,
      };
      await writeManifest(manifestPath, updatedManifest);
      console.info('\nManifest updated.');
    } else {
      console.info('No target harnesses detected. Nothing else to install.');
    }
    if (!options.dryRun) {
      await recordHomeProvenance('install', baseDir);
    }
    return;
  }

  const updatedHarnesses: Partial<Record<HarnessId, HarnessManifest>> = { ...manifest.harnesses };

  for (const harnessId of harnesses) {
    console.info(`\nInstalling for harness: ${harnessId}`);
    const paths = resolveHarnessPaths(harnessId, baseDir);

    // Safety check: ensure target directories are not symlinks
    checkSymlinkSafety(paths.skillsDir);
    checkSymlinkSafety(paths.subagentsDir);
    checkSymlinkSafety(paths.scriptsDir);

    // Build lookup of previously installed entries for drift detection
    const existingEntries = manifest.harnesses[harnessId]?.entries ?? [];
    const existingByPath = new Map(existingEntries.map((e) => [e.relativePath, e]));

    const entries: Array<ManifestEntry> = [];

    // Load the harness overlay once per harness. The raw YAML feeds the frontmatter merger (subagents only);
    // the parsed `_tools:` mapping feeds the body-text placeholder rewriter (subagents and skills).
    const harnessConfig = HARNESSES[harnessId];
    const overlayYaml = await loadHarnessOverlay(contentDir, harnessConfig);
    const toolMapping = loadToolMapping(overlayYaml);

    // Install skill support directories (e.g. `_data`). Skills themselves deploy per-declaration via `sync`.
    const skillsPrefix = resolveSkillsPathPrefix(harnessConfig);
    const supportEntries = await installSupportDirectories(
      contentDir,
      paths.skillsDir,
      paths.harnessHome,
      existingByPath,
      options,
      harnessId,
      skillsPrefix,
      harnessConfig.homeDir,
      toolMapping,
      harnessConfig.skillSigil,
      harnessConfig.subagentSigil,
    );
    entries.push(...supportEntries);

    // Install scripts
    const scriptEntries = await installScripts(
      contentDir,
      paths.scriptsDir,
      paths.harnessHome,
      harnessConfig,
      existingByPath,
      options,
    );
    entries.push(...scriptEntries);

    // Wire the session-lifecycle hook entries once the relay script is in place, so the configured commands point at
    // a script that exists. `--skip-hooks` leaves the harness config untouched. A failure — an unparseable config —
    // costs the hooks a warning, never the rest of the install: the manifest must still record what was copied.
    if (options.hooks !== false) {
      if (options.dryRun) {
        console.info('    [hooks] Would wire session-lifecycle hook entries');
      } else {
        try {
          await ensureHarnessHookEntries(harnessId, baseDir);
        } catch (error) {
          console.warn(
            `  ⚠️ Skipping hook wiring: ${error instanceof Error ? error.message : String(error)} ` +
              '(fix the config, then run configure-hooks)',
          );
        }
      }
    }

    // Install harness-specific guidance file
    const guidanceEntries = await installHarnessGuidance(contentDir, paths, harnessId, existingByPath, options);
    entries.push(...guidanceEntries);

    // Reconcile against the previous manifest: remove files whose source was deleted. Runs before the dry-run
    // gate so `--dry-run` previews removals. User-modified orphans are kept (unless `--force`) and stay tracked.
    const pruned = await pruneOrphanedEntries(existingEntries, entries, paths.harnessHome, options);
    entries.push(...pruned.retained);
    emitReport(describePruneResult(pruned, options));

    if (options.dryRun) {
      console.info(`  [dry-run] Would install ${entries.length} items:`);
      console.info(`    ${supportEntries.length} skill support items`);
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
    console.info(`  ✅ Installed ${entries.length} items for ${harnessId}`);
  }

  if (!options.dryRun) {
    const updatedManifest: AgentsManifest = {
      ...manifest,
      shared: sharedGuidanceResult ?? manifest.shared,
      harnesses: updatedHarnesses,
    };
    await writeManifest(manifestPath, updatedManifest);
    console.info('\nManifest updated.');
    await recordHomeProvenance('install', baseDir);
  }
}

/**
 * Installs skill support directories (e.g. `_data`) into the target skills directory. Skills themselves — any
 * `content/skills/<slug>/` holding a `SKILL.md` — deploy per-declaration via `sync`, not here, so this pass installs
 * only the non-skill support entries; `_partials` (an install-time include target) and dotfiles are excluded.
 *
 * If a previously installed item has been modified by the user, it is skipped unless `--force` is set,
 * mirroring the uninstall command's drift-checking behavior.
 */
async function installSupportDirectories(
  contentDir: string,
  skillsDestDir: string,
  harnessHome: string,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
  harnessId: HarnessId,
  skillsPrefix: string,
  homeDir: string,
  toolMapping: ReadonlyMap<string, string>,
  skillSigil: string,
  subagentSigil: string,
): Promise<ReadonlyArray<ManifestEntry>> {
  const skillsSrcDir = path.join(contentDir, 'skills');
  const entries: Array<ManifestEntry> = [];

  // `listSupportEntries` reports an absent directory as empty, so the absence is probed separately: content shipping no
  // `skills/` has lost the support files every skill reads at runtime, and a silent success would hide that.
  try {
    await stat(skillsSrcDir);
  } catch (error: unknown) {
    if (!isEnoent(error)) {
      throw error;
    }
    console.warn(`  ⚠️ Warning: no skills directory found at ${skillsSrcDir}, skipping skill support installation`);
    return [];
  }

  // Install non-skill support directories (e.g. `_data`, which skills reference at runtime by absolute path). What
  // counts as one is `listSupportEntries`, shared with `validate` so the pass that checks these and the pass that
  // deploys them cannot come to disagree about which entries they are.
  for (const entry of await listSupportEntries(skillsSrcDir)) {
    const result = await installSkillEntry(
      path.join(skillsSrcDir, entry),
      path.join(skillsDestDir, entry),
      `skills/${entry}`,
      `skills/${entry}`,
      harnessHome,
      existingByPath,
      options,
      skillsPrefix,
      homeDir,
      harnessId,
      contentDir,
      toolMapping,
      skillSigil,
      subagentSigil,
    );
    if (result !== undefined) {
      entries.push(result);
    }
  }

  return entries;
}

/**
 * Installs a single skill entry (directory or file) from source to destination.
 * Skills are always copied and rewritten (never symlinked), because they require path transformation at install time
 * — the same pattern subagents use for frontmatter merging.
 */
async function installSkillEntry(
  srcPath: string,
  destPath: string,
  relativePath: string,
  sourceRelativeRoot: string,
  harnessHome: string,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
  skillsPrefix: string,
  homeDir: string,
  harnessId: string,
  contentDir: string,
  toolMapping: ReadonlyMap<string, string>,
  skillSigil: string,
  subagentSigil: string,
  label = '',
): Promise<ManifestEntry | undefined> {
  // Eagerly render the entry before the dry-run gate, so missing include targets, cycles, out-of-tree references,
  // dead anchors, and unmapped tool placeholders surface even when no files are written. `renderSupportEntry` is the
  // same render `validate` runs, which is what keeps the two passes agreeing on what a support entry is.
  const rendered = await renderSupportEntry(srcPath, path.basename(destPath), contentDir, {
    toolMapping,
    anchor: homeAnchor(skillsPrefix),
    homeDir,
    harnessId,
    skillSigil,
    subagentSigil,
  });

  // A support directory holding only dotfiles or `_partials/` renders to zero entries — nothing to install. Skip it
  // entirely: no destination, no markers, no manifest entry. The orphan-prune pass clears any previously installed copy.
  if (rendered.kind === 'directory' && rendered.entries.length === 0) {
    console.info(`    [skip] ${relativePath}${label ? ` ${label}` : ''} (no installable entries)`);
    return undefined;
  }

  if (options.dryRun) {
    console.info(`    [copy] ${relativePath}${label ? ` ${label}` : ''}`);
    return { relativePath, contentHash: 'dry-run', linked: false };
  }

  // Check for user modifications before overwriting
  const existingEntry = existingByPath.get(relativePath);
  if (existingEntry && !options.force) {
    const drift = await detectDrift(existingEntry, harnessHome);
    if (drift === 'modified') {
      console.warn(`  ⚠️ Skipping modified item: ${relativePath}`);
      return existingEntry;
    }
  }

  if (rendered.kind === 'directory') {
    // Clean-write directories CodeAssembly previously installed: remove the prior copy so files deleted from the
    // source skill don't survive in the destination. Gated on prior ownership (a manifest entry exists) so a
    // first-time install never wipes a coincidentally same-named directory the user already had.
    if (existingEntry) {
      await removeItem(destPath);
    }
    await writeRenderedSkillDir(destPath, rendered.entries);
    await injectMarkersInDirectory(destPath, (fileRelPath) => buildSourceUrl(`${sourceRelativeRoot}/${fileRelPath}`));
  } else if (rendered.kind === 'markdown') {
    // Single-file `.md` skill entries: write the previously expanded content directly.
    // Skipping the verbatim copy avoids the expand-copy-expand-overwrite redundancy
    // and ensures the validated content is the content written to disk (no second read).
    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, rendered.content, 'utf8');
    await injectMarkerInFile(destPath, buildSourceUrl(sourceRelativeRoot));
  } else {
    // Single-file non-`.md` skill entries: plain copy, no expansion.
    await copyItem(srcPath, destPath);
  }

  return {
    relativePath,
    contentHash: rendered.kind === 'directory' ? `sha256:dir:${relativePath}` : await computeContentHash(destPath),
    linked: false,
  };
}

/**
 * Writes a rendered skill directory to `destDir`: markdown entries are written from their transformed content, asset
 * entries are copied verbatim from source. Each entry's parent directory is created as needed.
 */
async function writeRenderedSkillDir(destDir: string, entries: ReadonlyArray<RenderedSkillEntry>): Promise<void> {
  for (const entry of entries) {
    const destPath = path.join(destDir, entry.relPath);
    await mkdir(path.dirname(destPath), { recursive: true });
    await (entry.kind === 'markdown' ? writeFile(destPath, entry.content, 'utf8') : copyItem(entry.srcPath, destPath));
  }
}

/**
 * Installs script files from content/scripts/ into the target scripts directory.
 * Scripts are flat files (no frontmatter, no harness-specific variants).
 * Copied scripts receive the executable bit (0o755); symlinked scripts inherit the source's permissions.
 */
async function installScripts(
  contentDir: string,
  scriptsDestDir: string,
  harnessHome: string,
  harnessConfig: HarnessConfig,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
): Promise<ReadonlyArray<ManifestEntry>> {
  const scriptsSrcDir = path.join(contentDir, 'scripts');
  let dirEntries: ReadonlyArray<string>;
  try {
    dirEntries = await readdir(scriptsSrcDir);
  } catch (error: unknown) {
    if (!isEnoent(error)) {
      throw error;
    }
    console.warn(`  ⚠️ Warning: no scripts directory found at ${scriptsSrcDir}, skipping script installation`);
    return [];
  }

  const entries: Array<ManifestEntry> = [];

  for (const entry of dirEntries) {
    if (entry.startsWith('.')) {
      continue;
    }

    // Skip non-script files (e.g. README.md); only helper scripts ship to harness homes.
    if (SCRIPT_EXTENSIONS.every((extension) => !entry.endsWith(extension))) {
      continue;
    }

    const srcPath = path.join(scriptsSrcDir, entry);

    // Skip directories (e.g. __tests__)
    const srcStat = await stat(srcPath);
    if (!srcStat.isFile()) {
      continue;
    }
    const destPath = path.join(scriptsDestDir, entry);
    const relativePath = `${harnessConfig.scriptsDirName}/${entry}`;

    if (options.dryRun) {
      const action = options.link ? 'link' : 'copy';
      console.info(`    [${action}] ${relativePath}`);
      entries.push({ relativePath, contentHash: 'dry-run', linked: options.link });
      continue;
    }

    // Check for user modifications before overwriting
    const existingEntry = existingByPath.get(relativePath);
    if (existingEntry && !options.force) {
      const drift = await detectDrift(existingEntry, harnessHome);
      if (drift === 'modified') {
        console.warn(`  ⚠️ Skipping modified item: ${relativePath}`);
        entries.push(existingEntry);
        continue;
      }
    }

    await (options.link ? linkItem(srcPath, destPath) : copyItem(srcPath, destPath));

    // Ensure copied scripts are executable
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
 * Installs shared guidance files from `content/guidance/shared/` to `~/.agents/`.
 * Runs unconditionally (not gated by harness detection).
 */
async function installSharedGuidance(
  contentDir: string,
  manifest: AgentsManifest,
  options: InstallOptions,
  baseDir?: string,
): Promise<SharedManifest | undefined> {
  const sharedSrcDir = path.join(contentDir, 'guidance', 'shared');
  let dirEntries: ReadonlyArray<string>;
  try {
    dirEntries = await readdir(sharedSrcDir);
  } catch (error: unknown) {
    if (!isEnoent(error)) {
      throw error;
    }
    console.warn(
      `  ⚠️ Warning: no shared guidance directory found at ${sharedSrcDir}, skipping shared guidance installation`,
    );
    return undefined;
  }

  const sharedHome = resolveSharedHome(baseDir);
  checkSymlinkSafety(sharedHome);

  const existingEntries = manifest.shared?.entries ?? [];
  const existingByPath = new Map(existingEntries.map((e) => [e.relativePath, e]));
  const entries: Array<ManifestEntry> = [];

  console.info('\nInstalling shared guidance');

  let anyWritten = false;

  for (const fileName of dirEntries) {
    if (fileName.startsWith('.')) {
      continue;
    }

    const { manifestEntry, written } = await installSharedGuidanceEntry(
      fileName,
      sharedSrcDir,
      sharedHome,
      existingByPath.get(fileName),
      options,
    );
    entries.push(manifestEntry);
    anyWritten ||= written;
  }

  // Reconcile shared guidance against the previous manifest before reporting or persisting, so deleted-source
  // files are removed from `~/.agents/` too. User-modified orphans are kept (unless `--force`) and stay tracked.
  const pruned = await pruneOrphanedEntries(existingEntries, entries, sharedHome, options);
  entries.push(...pruned.retained);
  emitReport(describePruneResult(pruned, options));

  if (options.dryRun) {
    console.info(`  [dry-run] Would install ${entries.length} shared guidance items`);
    return undefined;
  }

  console.info(`  ✅ Installed ${entries.length} shared guidance items`);

  return {
    version: readRunningPackageVersion(),
    installedAt: anyWritten ? new Date().toISOString() : (manifest.shared?.installedAt ?? new Date().toISOString()),
    entries,
  };
}

/**
 * Installs one shared guidance file into `~/.agents/`, reporting the manifest entry to record and whether the install
 * touched the destination. A dry run and a skipped user-modified file both report `written: false`, which keeps the
 * caller's `installedAt` on its previous value when nothing reached disk.
 */
async function installSharedGuidanceEntry(
  fileName: string,
  sharedSrcDir: string,
  sharedHome: string,
  existingEntry: ManifestEntry | undefined,
  options: InstallOptions,
): Promise<{ manifestEntry: ManifestEntry; written: boolean }> {
  const srcPath = path.join(sharedSrcDir, fileName);
  const destPath = path.join(sharedHome, fileName);
  const isMarkdown = fileName.endsWith('.md');

  // Shared guidance ships verbatim, with no include expansion and no rewriting, so the anchor check reads the source
  // itself rather than riding a render. It runs before the dry-run gate, and in link mode too: a symlinked file
  // reaches the reader with the same dead locator a copied one would.
  if (isMarkdown) {
    assertAnchorsResolve(await readFile(srcPath, 'utf8'), `guidance/shared/${fileName}`);
  }

  if (options.dryRun) {
    const action = options.link ? 'link' : 'copy';
    console.info(`    [${action}] ${fileName} -> ~/.agents/${fileName}`);
    return { manifestEntry: { relativePath: fileName, contentHash: 'dry-run', linked: options.link }, written: false };
  }

  // Check for user modifications before overwriting
  if (existingEntry && !options.force) {
    const drift = await detectDrift(existingEntry, sharedHome);
    if (drift === 'modified') {
      console.warn(`  ⚠️ Skipping modified item: ~/.agents/${fileName}`);
      return { manifestEntry: existingEntry, written: false };
    }
  }

  await (options.link ? linkItem(srcPath, destPath) : copyItem(srcPath, destPath));

  // Copy-mode .md files receive a provenance marker. Link-mode entries are symlinks
  // to the source file; marking them would mislabel the source itself.
  if (!options.link && isMarkdown) {
    await injectMarkerInFile(destPath, buildSourceUrl(`guidance/shared/${fileName}`));
  }

  return {
    manifestEntry: {
      relativePath: fileName,
      contentHash: await computeContentHash(options.link ? srcPath : destPath),
      linked: options.link,
    },
    written: true,
  };
}

/**
 * Installs harness-specific guidance files from `content/guidance/_harnesses/{harnessId}/` into the harness
 * home directory. Harness guidance is always copied and rewritten (never symlinked), because install-time path
 * rewriting produces absolute link targets that agents can resolve without knowing a path convention.
 */
async function installHarnessGuidance(
  contentDir: string,
  harnessPaths: { harnessHome: string },
  harnessId: HarnessId,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
): Promise<ReadonlyArray<ManifestEntry>> {
  const harnessConfig = HARNESSES[harnessId];
  const guidanceSrcDir = path.join(contentDir, 'guidance', '_harnesses', harnessId);
  let dirEntries: ReadonlyArray<string>;
  try {
    dirEntries = await readdir(guidanceSrcDir);
  } catch (error: unknown) {
    if (!isEnoent(error)) {
      throw error;
    }
    console.warn(
      `  ⚠️ Warning: no harness guidance directory found at ${guidanceSrcDir}, skipping harness guidance installation`,
    );
    return [];
  }

  const entries: Array<ManifestEntry> = [];

  for (const entry of dirEntries) {
    if (entry.startsWith('.')) {
      continue;
    }

    const srcPath = path.join(guidanceSrcDir, entry);
    const destPath = path.join(harnessPaths.harnessHome, entry);

    // Resolve include directives at source-tree level, strip the guidance-hook declarations the expansion carried in,
    // then check the result for anchors that name nothing. All three run before the dry-run gate so missing targets,
    // cycles, out-of-tree references, malformed hooks, and dead in-body locators surface even when no files are
    // written.
    let expandedContent: string | undefined;
    if (entry.endsWith('.md')) {
      const sourceLabel = `guidance/_harnesses/${harnessId}/${entry}`;
      expandedContent = stripGuidanceHooks(await expandIncludes(srcPath, contentDir), sourceLabel);
      assertAnchorsResolve(expandedContent, sourceLabel);
    }

    if (options.dryRun) {
      console.info(`    [copy] ${entry} (guidance)`);
      entries.push({ relativePath: entry, contentHash: 'dry-run', linked: false });
      continue;
    }

    // Check for user modifications before overwriting
    const existingEntry = existingByPath.get(entry);
    if (existingEntry && !options.force) {
      const drift = await detectDrift(existingEntry, harnessPaths.harnessHome);
      if (drift === 'modified') {
        console.warn(`  ⚠️ Skipping modified item: ${harnessConfig.homeDir}/${entry}`);
        entries.push(existingEntry);
        continue;
      }
    }

    // The wholesale re-render below would drop whatever sync wrote into the ambient region, so capture the existing
    // destination's region content first; it is spliced back once the fresh render is in place.
    const preservedAmbient = entry.endsWith('.md') ? await readAmbientRegionContent(destPath) : undefined;

    await unlinkIfSymlink(destPath);
    await copyItem(srcPath, destPath);

    // For .md files, replace the freshly-copied content with the include-expanded content, then run downstream link
    // rewriting and template/marker injection on the expanded text.
    if (entry.endsWith('.md')) {
      if (expandedContent !== undefined) {
        await writeFile(destPath, expandedContent, 'utf8');
      }
      await rewritePathsInFile(destPath, entry, harnessConfig.homeDir, harnessConfig.homeDir, harnessConfig.id);
      await injectMarkerInFile(destPath, buildSourceUrl(`guidance/_harnesses/${harnessId}/${entry}`));

      // Splice the preserved region content into the fresh render. The region's location comes from the template;
      // its content belongs to sync and must survive an install. A template that no longer carries the region wins:
      // the content is dropped and the next `sync` re-delivers or warns.
      if (preservedAmbient !== undefined && preservedAmbient !== '') {
        const rendered = await readFile(destPath, 'utf8');
        if (hasAmbientRegion(rendered)) {
          await writeFile(destPath, injectAmbientRegion(rendered, preservedAmbient), 'utf8');
        }
      }
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
 * Reads the ambient-region content of the file at `filePath`, returning `undefined` when the file is absent or
 * carries no complete region.
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
