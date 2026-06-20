import { chmod, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveContentDir } from '../lib/content-resolver.ts';
import { expandIncludes } from '../lib/directive-expander.ts';
import { mergeFrontmatter, parseFrontmatter } from '../lib/frontmatter-merger.ts';
import { HARNESSES, resolveHarnessIds, resolveHarnessPaths } from '../lib/harness.js';
import { checkSymlinkSafety, copyItem, linkItem, unlinkIfSymlink } from '../lib/installer.ts';
import {
  computeContentHash,
  detectDrift,
  getManifestPath,
  readManifest,
  resolveSharedHome,
  writeManifest,
} from '../lib/manifest.js';
import {
  buildSourceUrl,
  injectMarkerInFile,
  injectMarkersInDirectory,
  injectProvenanceMarker,
} from '../lib/marker-injector.js';
import { pruneOrphanedEntries } from '../lib/orphan-pruner.ts';
import { rewritePathsInDirectory, rewritePathsInFile } from '../lib/path-rewriter.js';
import { loadToolMapping, rewriteToolNames } from '../lib/tool-name-rewriter.js';
import { isEnoent, isMissingFile } from '../lib/type-guards.ts';
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
    const overlayYaml = await readOverlay(contentDir, harnessConfig.frontmatterFile);
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

    // Install subagents with merged frontmatter
    const subagentEntries = await installSubagents(
      contentDir,
      paths,
      harnessId,
      existingByPath,
      options,
      overlayYaml,
      toolMapping,
    );
    entries.push(...subagentEntries);

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
      console.info(`    ${subagentEntries.length} subagent items`);
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
 * Installs skill directories from content/skills/ into the target skills directory.
 * Shared skills (top-level entries) are installed for all harnesses.
 * Harness-specific skills from `_harnesses/{harnessId}/` are installed only for the matching harness.
 * The `_harnesses` directory is skipped (handled by dedicated harness-specific logic below).
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
  // Eagerly resolves include directives at source-tree level. Run before the dry-run gate so missing targets, cycles,
  // and out-of-tree references surface even when no files are written.
  // Directory entries traverse their tree and cache each expanded `.md` file's content;
  // file entries expand the file directly.
  // After expansion, applies the tool-name rewriter in-memory so the cached content carries the final body text the
  // write phase will emit — no second disk pass, no read-back-from-disk.
  const srcStats = await stat(srcPath);
  let expandedFileContent: string | undefined;
  let expandedDirContents: ReadonlyMap<string, string> | undefined;
  if (srcStats.isDirectory()) {
    const rawExpanded = await preExpandSkillDirectory(srcPath, contentDir);
    expandedDirContents = rewriteToolNamesInExpansionMap(rawExpanded, contentDir, toolMapping);
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
    // Per-file walk: Writes expanded `.md` files from the cache populated during the pre-expand pass,
    // mirrors the directory structure to the destination, and copies non-`.md` files plainly.
    // The `_partials/` exclusion is applied during the walk.
    // The cache is non-undefined here because srcStats.isDirectory() implies the directory branch above ran.
    if (expandedDirContents === undefined) {
      throw new Error(`Invariant violation: expandedDirContents undefined for directory ${srcPath}`);
    }
    await writeExpandedSkillDir(srcPath, destPath, expandedDirContents);
    const skillsDestDir = path.dirname(destPath);
    await rewritePathsInDirectory(destPath, skillsDestDir, skillsPrefix, homeDir, harnessId);
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
 * Eagerly walks a skill source directory, runs `expandIncludes` on each `.md` file to surface include errors before
 * any file is written, and returns a map keyed by absolute source path with the expanded content.
 * `_partials/` directories are skipped because their contents are referenced through includes, not installed.
 * The returned map is consumed by `writeExpandedSkillDir` so each `.md` file is expanded once per install.
 */
async function preExpandSkillDirectory(srcDir: string, contentDir: string): Promise<Map<string, string>> {
  const expandedBySrcPath = new Map<string, string>();
  await collectExpansions(srcDir, contentDir, expandedBySrcPath);
  return expandedBySrcPath;
}

async function collectExpansions(
  srcDir: string,
  contentDir: string,
  expandedBySrcPath: Map<string, string>,
): Promise<void> {
  const entries = await readdir(srcDir);
  for (const entry of entries) {
    if (entry === '_partials' || entry.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(srcDir, entry);
    const info = await stat(fullPath);
    if (info.isDirectory()) {
      await collectExpansions(fullPath, contentDir, expandedBySrcPath);
    } else if (entry.endsWith('.md')) {
      expandedBySrcPath.set(fullPath, await expandIncludes(fullPath, contentDir));
    }
  }
}

/**
 * Recursively writes a skill source directory to the destination. `.md` files are read from the pre-computed expansion
 * cache (populated by `preExpandSkillDirectory`); non-`.md` files are copied verbatim.
 * `_partials/` subdirectories are skipped at any depth — their contents are include targets, not installed artifacts.
 */
async function writeExpandedSkillDir(
  srcDir: string,
  destDir: string,
  expandedBySrcPath: ReadonlyMap<string, string>,
): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir);
  for (const entry of entries) {
    if (entry === '_partials' || entry.startsWith('.')) {
      continue;
    }
    const srcPath = path.join(srcDir, entry);
    const destPath = path.join(destDir, entry);
    const info = await stat(srcPath);
    if (info.isDirectory()) {
      await writeExpandedSkillDir(srcPath, destPath, expandedBySrcPath);
    } else if (entry.endsWith('.md')) {
      const expanded = expandedBySrcPath.get(srcPath);
      if (expanded === undefined) {
        throw new Error(`Invariant violation: pre-expand cache missing entry for ${srcPath}`);
      }
      await writeFile(destPath, expanded, 'utf8');
    } else {
      await copyItem(srcPath, destPath);
    }
  }
}

/**
 * Installs subagent .md files with harness-specific frontmatter merging.
 * If a previously installed item has been modified by the user, it is skipped unless `--force` is set,
 * mirroring the uninstall command's drift-checking behavior.
 */
async function installSubagents(
  contentDir: string,
  harnessPaths: { harnessHome: string; subagentsDir: string },
  harnessId: HarnessId,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
  overlayYaml: string,
  toolMapping: ReadonlyMap<string, string>,
): Promise<ReadonlyArray<ManifestEntry>> {
  const subagentsSrcDir = path.join(contentDir, 'subagents');
  const harnessConfig = HARNESSES[harnessId];

  const dirEntries = await readdir(subagentsSrcDir);
  const entries: Array<ManifestEntry> = [];

  for (const entry of dirEntries) {
    if (entry === '_data' || entry === '_partials' || !entry.endsWith('.md')) {
      continue;
    }

    const srcPath = path.join(subagentsSrcDir, entry);
    const destPath = path.join(harnessPaths.subagentsDir, entry);
    const relativePath = `${harnessConfig.subagentsDirName}/${entry}`;

    // Resolve include directives at source-tree level. Run before the dry-run gate so missing targets, cycles, and
    // out-of-tree references surface even when no files are written. Mirrors the ordering in installHarnessGuidance.
    const expandedSource = await expandIncludes(srcPath, contentDir);

    if (options.dryRun) {
      const action = options.link ? 'link' : 'copy';
      console.info(`    [${action}] ${relativePath}`);
      entries.push({
        relativePath,
        contentHash: 'dry-run',
        linked: options.link,
      });
      continue;
    }

    // Check for user modifications before overwriting
    const existingEntry = existingByPath.get(relativePath);
    if (existingEntry && !options.force) {
      const drift = await detectDrift(existingEntry, harnessPaths.harnessHome);
      if (drift === 'modified') {
        console.warn(`  ⚠️ Skipping modified item: ${relativePath}`);
        entries.push(existingEntry);
        continue;
      }
    }

    // Pipeline: Expand includes -> merge frontmatter -> rewrite tool-name placeholders ->
    // inject provenance marker -> write -> rewrite paths.
    const sourceLabel = `subagents/${entry}`;
    const merged = mergeFrontmatter(expandedSource, overlayYaml);
    const rewritten = rewriteToolNames(merged, toolMapping, sourceLabel);
    const withMarker = injectProvenanceMarker(rewritten, buildSourceUrl(sourceLabel));
    await mkdir(path.dirname(destPath), { recursive: true });
    await unlinkIfSymlink(destPath);
    await writeFile(destPath, withMarker, 'utf8');

    // Expand `{harness_home_dir}` tokens so the body's script references resolve to real paths.
    await rewritePathsInFile(destPath, entry, harnessConfig.homeDir, harnessConfig.homeDir, harnessConfig.id);

    const hash = await computeContentHash(destPath);
    entries.push({
      relativePath,
      contentHash: hash,
      linked: false, // Subagents are always copied (merged content), never linked
    });
  }

  return entries;
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

  // Gather skill metadata from installed skills directory
  let skillDirEntries: ReadonlyArray<string>;
  try {
    skillDirEntries = await readdir(paths.skillsDir);
  } catch (error: unknown) {
    if (!isEnoent(error)) {
      throw error;
    }
    console.warn(`  ⚠️ Warning: skills directory not found, skipping prompts.yml generation: ${paths.skillsDir}`);
    return undefined;
  }

  const sortedSkillNames = [...skillDirEntries].toSorted();

  const promptEntries: Array<{ name: string; description: string; contentFile: string }> = [];

  for (const skillName of sortedSkillNames) {
    const skillMdPath = path.join(paths.skillsDir, skillName, 'SKILL.md');
    let skillContent: string;
    try {
      skillContent = await readFile(skillMdPath, 'utf8');
    } catch (error: unknown) {
      // Tolerate any non-directory entry in the destination skills directory (e.g. a `.DS_Store` left by Finder):
      // joining `SKILL.md` onto a regular file raises `ENOTDIR`; a directory without `SKILL.md` raises `ENOENT`.
      // Either way the entry is not a skill and should be skipped.
      if (isMissingFile(error)) {
        continue;
      }
      throw error;
    }

    const { lines } = parseFrontmatter(skillContent);

    // Extract user-invocable and description from frontmatter lines
    let userInvocable = true; // Default: included unless explicitly false
    let description = '';
    for (const line of lines) {
      if (line.startsWith('user-invocable:')) {
        const value = line.slice('user-invocable:'.length).trim();
        userInvocable = value !== 'false';
      }
      if (line.startsWith('description:')) {
        description = line.slice('description:'.length).trim();
        // Strip surrounding quotes if present and unescape internal escapes
        if (description.startsWith("'") && description.endsWith("'")) {
          description = description.slice(1, -1).replaceAll("''", "'");
        } else if (description.startsWith('"') && description.endsWith('"')) {
          description = description.slice(1, -1).replaceAll(String.raw`\"`, '"');
        }
      }
    }

    if (!userInvocable) {
      continue;
    }

    promptEntries.push({
      name: skillName,
      description,
      contentFile: `skills/${skillName}/SKILL.md`,
    });
  }

  // Build YAML content with deterministic template literals. Description values are single-quoted with internal single
  // quotes escaped (doubled) to prevent YAML-special characters from producing invalid output.
  const yamlLines = ['prompts:'];
  for (const entry of promptEntries) {
    const escapedDescription = entry.description.replaceAll("'", "''");
    yamlLines.push(
      `  - name: '${entry.name}'`,
      `    description: '${escapedDescription}'`,
      `    content_file: ${entry.contentFile}`,
    );
  }
  const yamlContent = yamlLines.join('\n') + '\n';

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

/**
 * Returns a new map mirroring `rawExpanded`, with every value processed through the tool-name rewriter.
 * The map is preserved by-reference (same keys, same iteration order); only the string values change. Each entry's
 * `contextLabel` is its content-relative POSIX path, so an unmapped placeholder surfaces a usable file reference.
 */
function rewriteToolNamesInExpansionMap(
  rawExpanded: ReadonlyMap<string, string>,
  contentDir: string,
  toolMapping: ReadonlyMap<string, string>,
): Map<string, string> {
  const rewritten = new Map<string, string>();
  for (const [absSrcPath, content] of rawExpanded) {
    const label = relativeFromContent(contentDir, absSrcPath);
    rewritten.set(absSrcPath, rewriteToolNames(content, toolMapping, label));
  }
  return rewritten;
}

/** Reads a subagent overlay YAML file. Returns an empty string when the file does not exist. */
async function readOverlay(contentDir: string, frontmatterFile: string): Promise<string> {
  const overlayPath = path.join(contentDir, 'subagents', '_data', frontmatterFile);
  try {
    return await readFile(overlayPath, 'utf8');
  } catch (error: unknown) {
    if (!isEnoent(error)) {
      throw error;
    }
    return '';
  }
}
