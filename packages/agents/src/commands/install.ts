import { chmod, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveContentDir } from '../lib/content-resolver.ts';
import { expandIncludes } from '../lib/directive-expander.ts';
import { pruneOrphanedEntries } from '../lib/entry-remover.ts';
import { HARNESSES, resolveHarnessIds, resolveHarnessPaths } from '../lib/harness.js';
import { loadHarnessOverlay } from '../lib/harness-overlay.ts';
import { checkSymlinkSafety, copyItem, linkItem, removeItem, unlinkIfSymlink } from '../lib/installer.ts';
import {
  computeContentHash,
  detectDrift,
  getManifestPath,
  readManifest,
  resolveSharedHome,
  writeManifest,
} from '../lib/manifest.js';
import { buildSourceUrl, injectMarkerInFile, injectMarkersInDirectory } from '../lib/marker-injector.js';
import { rewritePathsInFile } from '../lib/path-rewriter.js';
import { renderPromptsYml } from '../lib/prompts-yml.ts';
import { type RenderedSkillEntry, renderSkillDirectory } from '../lib/skill-transform.ts';
import { loadToolMapping, rewriteToolNames } from '../lib/tool-name-rewriter.js';
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

/**
 * Executes the install command, installing skills and subagents for the specified harnesses.
 */
export async function installCommand(
  options: InstallOptions,
  baseDir?: string,
  contentDirOverride?: string,
): Promise<void> {
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

    // Install skills (shared + harness-specific)
    const skillsPrefix = `${harnessConfig.homeDir}/${harnessConfig.skillsDirName}`;
    const skillEntries = await installSkills(
      contentDir,
      paths.skillsDir,
      paths.harnessHome,
      existingByPath,
      options,
      harnessId,
      skillsPrefix,
      harnessConfig.homeDir,
      toolMapping,
    );
    entries.push(...skillEntries);

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

    // Install harness-specific guidance file
    const guidanceEntries = await installHarnessGuidance(contentDir, paths, harnessId, existingByPath, options);
    entries.push(...guidanceEntries);

    // Generate prompts.yml for Rovo Dev (skill discovery file)
    if (harnessId === 'rovodev') {
      const promptsEntry = await generatePromptsYml(paths, existingByPath, options);
      if (promptsEntry) {
        entries.push(promptsEntry);
      }
    }

    // Reconcile against the previous manifest: remove files whose source was deleted. Runs before the dry-run
    // gate so `--dry-run` previews removals. User-modified orphans are kept (unless `--force`) and stay tracked.
    const { retained } = await pruneOrphanedEntries(existingEntries, entries, paths.harnessHome, options);
    entries.push(...retained);

    if (options.dryRun) {
      console.info(`  [dry-run] Would install ${entries.length} items:`);
      console.info(`    ${skillEntries.length} skill items`);
      console.info(`    ${scriptEntries.length} script items`);
      console.info(`    ${guidanceEntries.length} guidance items`);
      continue;
    }

    updatedHarnesses[harnessId] = {
      harness: harnessId,
      version: '0.1.0',
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
  }
}

/**
 * Installs support directories (e.g. `_data`) and harness-specific skills into the target skills directory.
 * The general skill catalog — any `content/skills/<slug>/` holding a `SKILL.md` — deploys per-declaration via `sync`,
 * not here; this pass installs only the non-skill support entries plus the matching harness's
 * `_harnesses/{harnessId}/` skills. `_harnesses` and `_partials` are excluded from the support pass.
 *
 * If a previously installed item has been modified by the user, it is skipped unless `--force` is set,
 * mirroring the uninstall command's drift-checking behavior.
 */
async function installSkills(
  contentDir: string,
  skillsDestDir: string,
  harnessHome: string,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
  harnessId: HarnessId,
  skillsPrefix: string,
  homeDir: string,
  toolMapping: ReadonlyMap<string, string>,
): Promise<ReadonlyArray<ManifestEntry>> {
  const skillsSrcDir = path.join(contentDir, 'skills');
  const dirEntries = await readdir(skillsSrcDir);
  const entries: Array<ManifestEntry> = [];

  // Install shared skills and support directories. Skip `_harnesses` (installed by the harness-specific pass below)
  // and `_partials` (an install-time include target whose content is inlined into including skills, never installed as
  // a standalone directory), plus dotfiles. This mirrors the per-skill `_partials` walk exclusion, which only matches
  // `_partials` as a child and so never fires when it is the enumeration root. Other reserved directories such as
  // `_data/` install normally — skills reference them at runtime by absolute path, so the skip is by name, not by the
  // leading-underscore convention.
  for (const entry of dirEntries) {
    if (entry === '_harnesses' || entry === '_partials' || entry.startsWith('.')) {
      continue;
    }
    // The general skill catalog (any directory holding a `SKILL.md`) deploys per-declaration via `sync`, never
    // unconditionally. Only non-skill support entries (e.g. `_data`, which skills reference at runtime) stay here.
    if (await isSkillDirectory(path.join(skillsSrcDir, entry))) {
      continue;
    }
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
    );
    entries.push(result);
  }

  // Install harness-specific skills from _harnesses/{harnessId}/
  const harnessSkillsSrcDir = path.join(skillsSrcDir, '_harnesses', harnessId);
  let harnessDirEntries: ReadonlyArray<string>;
  try {
    harnessDirEntries = await readdir(harnessSkillsSrcDir);
  } catch (error: unknown) {
    if (!isEnoent(error)) {
      throw error;
    }
    console.warn(`  ⚠️ Warning: no harness-specific skills directory found for ${harnessId}: ${harnessSkillsSrcDir}`);
    harnessDirEntries = [];
  }

  for (const entry of harnessDirEntries) {
    if (entry.startsWith('.')) {
      continue;
    }
    const result = await installSkillEntry(
      path.join(harnessSkillsSrcDir, entry),
      path.join(skillsDestDir, entry),
      `skills/${entry}`,
      `skills/_harnesses/${harnessId}/${entry}`,
      harnessHome,
      existingByPath,
      options,
      skillsPrefix,
      homeDir,
      harnessId,
      contentDir,
      toolMapping,
      '(harness-specific)',
    );
    entries.push(result);
  }

  return entries;
}

/**
 * Reports whether `entryDir` is a skill directory — one holding a `SKILL.md`. Skill directories deploy
 * per-declaration via `sync`, so the install pass skips them; a support directory such as `_data` (no `SKILL.md`)
 * is not a skill and stays on the install path.
 */
async function isSkillDirectory(entryDir: string): Promise<boolean> {
  try {
    await stat(path.join(entryDir, 'SKILL.md'));
    return true;
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return false;
    }
    throw error;
  }
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
  label = '',
): Promise<ManifestEntry> {
  // Eagerly render the skill's final body before the dry-run gate, so missing include targets, cycles, out-of-tree
  // references, and unmapped tool placeholders surface even when no files are written. Directory entries render the
  // whole tree (include expansion, tool-name + link/template rewriting) into the exact bytes the write phase emits;
  // single-file `.md` entries expand and tool-rewrite directly.
  const srcStats = await stat(srcPath);
  let expandedFileContent: string | undefined;
  let renderedDir: ReadonlyArray<RenderedSkillEntry> | undefined;
  if (srcStats.isDirectory()) {
    renderedDir = await renderSkillDirectory(srcPath, path.basename(destPath), {
      contentDir,
      toolMapping,
      pathPrefix: skillsPrefix,
      homeDir,
      harnessId,
    });
  } else if (srcPath.endsWith('.md')) {
    const expanded = await expandIncludes(srcPath, contentDir);
    expandedFileContent = rewriteToolNames(expanded, toolMapping, relativeFromContent(contentDir, srcPath));
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

  if (srcStats.isDirectory()) {
    // The rendered tree is non-undefined here because srcStats.isDirectory() implies the directory branch above ran.
    if (renderedDir === undefined) {
      throw new Error(`Invariant violation: renderedDir undefined for directory ${srcPath}`);
    }
    // Clean-write directories CodeAssembly previously installed: remove the prior copy so files deleted from the
    // source skill don't survive in the destination. Gated on prior ownership (a manifest entry exists) so a
    // first-time install never wipes a coincidentally same-named directory the user already had.
    if (existingEntry) {
      await removeItem(destPath);
    }
    await writeRenderedSkillDir(destPath, renderedDir);
    await injectMarkersInDirectory(destPath, (fileRelPath) => buildSourceUrl(`${sourceRelativeRoot}/${fileRelPath}`));
  } else if (srcPath.endsWith('.md') && expandedFileContent !== undefined) {
    // Single-file `.md` skill entries: write the previously expanded content directly.
    // Skipping the verbatim copy avoids the expand-copy-expand-overwrite redundancy
    // and ensures the validated content is the content written to disk (no second read).
    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, expandedFileContent, 'utf8');
    await injectMarkerInFile(destPath, buildSourceUrl(sourceRelativeRoot));
  } else {
    // Single-file non-`.md` skill entries: plain copy, no expansion.
    await copyItem(srcPath, destPath);
  }

  return {
    relativePath,
    contentHash: srcStats.isDirectory() ? `sha256:dir:${relativePath}` : await computeContentHash(destPath),
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
 * Generates `prompts.yml` for Rovo Dev, which is the skill discovery file that lists all user-invocable skills.
 * Skills with `user-invocable: false` are excluded.
 *
 * The file is written to `{harnessHome}/prompts.yml` and tracked in the manifest.
 */
async function generatePromptsYml(
  paths: { harnessHome: string; skillsDir: string },
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
): Promise<ManifestEntry | undefined> {
  const relativePath = 'prompts.yml';

  // Short-circuit in dry-run mode: no filesystem reads needed
  if (options.dryRun) {
    console.info(`    [generate] ${relativePath}`);
    return {
      relativePath,
      contentHash: 'dry-run',
      linked: false,
    };
  }

  const yamlContent = await renderPromptsYml(paths.skillsDir);
  if (yamlContent === undefined) {
    console.warn(`  ⚠️ Warning: skills directory not found, skipping prompts.yml generation: ${paths.skillsDir}`);
    return undefined;
  }

  // Check for user modifications before overwriting.
  // Files at 'current' drift are always regenerated to pick up any newly added skills.
  const existingEntry = existingByPath.get(relativePath);
  if (existingEntry && !options.force) {
    const drift = await detectDrift(existingEntry, paths.harnessHome);
    if (drift === 'modified') {
      console.warn(`  ⚠️ Skipping modified item: ${relativePath}`);
      return existingEntry;
    }
  }

  // Ensure harness home directory exists
  await mkdir(paths.harnessHome, { recursive: true });

  const destPath = path.join(paths.harnessHome, relativePath);
  await unlinkIfSymlink(destPath);
  await writeFile(destPath, yamlContent, 'utf8');

  const hash = await computeContentHash(destPath);
  return {
    relativePath,
    contentHash: hash,
    linked: false,
  };
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

    // Skip non-script files (e.g. README.md); only `.sh` helpers ship to harness homes.
    if (!entry.endsWith('.sh')) {
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

  for (const entry of dirEntries) {
    if (entry.startsWith('.')) {
      continue;
    }

    const srcPath = path.join(sharedSrcDir, entry);
    const destPath = path.join(sharedHome, entry);

    if (options.dryRun) {
      const action = options.link ? 'link' : 'copy';
      console.info(`    [${action}] ${entry} -> ~/.agents/${entry}`);
      entries.push({ relativePath: entry, contentHash: 'dry-run', linked: options.link });
      continue;
    }

    // Check for user modifications before overwriting
    const existingEntry = existingByPath.get(entry);
    if (existingEntry && !options.force) {
      const drift = await detectDrift(existingEntry, sharedHome);
      if (drift === 'modified') {
        console.warn(`  ⚠️ Skipping modified item: ~/.agents/${entry}`);
        entries.push(existingEntry);
        continue;
      }
    }

    await (options.link ? linkItem(srcPath, destPath) : copyItem(srcPath, destPath));

    // Copy-mode .md files receive a provenance marker. Link-mode entries are symlinks
    // to the source file; marking them would mislabel the source itself.
    if (!options.link && entry.endsWith('.md')) {
      await injectMarkerInFile(destPath, buildSourceUrl(`guidance/shared/${entry}`));
    }

    anyWritten = true;

    entries.push({
      relativePath: entry,
      contentHash: await computeContentHash(options.link ? srcPath : destPath),
      linked: options.link,
    });
  }

  // Reconcile shared guidance against the previous manifest before reporting or persisting, so deleted-source
  // files are removed from `~/.agents/` too. User-modified orphans are kept (unless `--force`) and stay tracked.
  const { retained } = await pruneOrphanedEntries(existingEntries, entries, sharedHome, options);
  entries.push(...retained);

  if (options.dryRun) {
    console.info(`  [dry-run] Would install ${entries.length} shared guidance items`);
    return undefined;
  }

  console.info(`  ✅ Installed ${entries.length} shared guidance items`);

  return {
    version: '0.1.0',
    installedAt: anyWritten ? new Date().toISOString() : (manifest.shared?.installedAt ?? new Date().toISOString()),
    entries,
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

    // Resolve include directives at source-tree level. Run before the dry-run gate so missing
    // targets, cycles, and out-of-tree references surface even when no files are written.
    let expandedContent: string | undefined;
    if (entry.endsWith('.md')) {
      expandedContent = await expandIncludes(srcPath, contentDir);
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
 * Returns a POSIX-style path label for a skill source file relative to `contentDir`, used as the `contextLabel`
 * argument to `rewriteToolNames` so install errors include a stable, harness-independent file reference.
 */
function relativeFromContent(contentDir: string, srcPath: string): string {
  return path.relative(contentDir, srcPath).split(path.sep).join('/');
}
