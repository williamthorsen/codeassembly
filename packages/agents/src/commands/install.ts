import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveContentDir } from '../lib/content-resolver.js';
import { mergeFrontmatter } from '../lib/frontmatter-merger.js';
import { checkSymlinkSafety, copyItem, linkItem } from '../lib/installer.js';
import { computeContentHash, detectDrift, getManifestPath, readManifest, writeManifest } from '../lib/manifest.js';
import { PLATFORMS, resolvePlatformIds, resolvePlatformPaths } from '../lib/platform.js';
import type { AgentsManifest, InstallOptions, ManifestEntry, PlatformId, PlatformManifest } from '../lib/types.js';

/**
 * Executes the install command, installing skills and subagents for the specified platforms.
 */
export async function installCommand(options: InstallOptions, baseDir?: string): Promise<void> {
  const contentDir = resolveContentDir();
  const manifestPath = getManifestPath(baseDir);
  const manifest = await readManifest(manifestPath);
  const platforms = resolvePlatformIds(options.platform, baseDir);

  if (platforms.length === 0) {
    console.info('No target platforms detected. Nothing to install.');
    return;
  }

  const updatedPlatforms: Partial<Record<PlatformId, PlatformManifest>> = { ...manifest.platforms };

  for (const platformId of platforms) {
    console.info(`\nInstalling for platform: ${platformId}`);
    const paths = resolvePlatformPaths(platformId, baseDir);

    // Safety check: ensure target directories are not symlinks
    checkSymlinkSafety(paths.skillsDir);
    checkSymlinkSafety(paths.subagentsDir);

    // Build lookup of previously installed entries for drift detection
    const existingEntries = manifest.platforms[platformId]?.entries ?? [];
    const existingByPath = new Map(existingEntries.map((e) => [e.relativePath, e]));

    const entries: Array<ManifestEntry> = [];

    // Install skills
    const skillEntries = await installSkills(contentDir, paths.skillsDir, paths.platformHome, existingByPath, options);
    entries.push(...skillEntries);

    // Install subagents with merged frontmatter
    const subagentEntries = await installSubagents(contentDir, paths, platformId, existingByPath, options);
    entries.push(...subagentEntries);

    if (options.dryRun) {
      console.info(`  [dry-run] Would install ${entries.length} items:`);
      console.info(`    ${skillEntries.length} skill items`);
      console.info(`    ${subagentEntries.length} subagent items`);
      continue;
    }

    updatedPlatforms[platformId] = {
      platform: platformId,
      version: '0.1.0',
      installedAt: new Date().toISOString(),
      entries,
    };
    console.info(`  Installed ${entries.length} items for ${platformId}`);
  }

  if (!options.dryRun) {
    const updatedManifest: AgentsManifest = {
      ...manifest,
      platforms: updatedPlatforms,
    };
    await writeManifest(manifestPath, updatedManifest);
    console.info('\nManifest updated.');
  }
}

/**
 * Installs skill directories from content/skills/ into the target skills directory.
 * If a previously installed item has been modified by the user, it is skipped unless
 * `--force` is set, mirroring the uninstall command's drift-checking behavior.
 */
async function installSkills(
  contentDir: string,
  skillsDestDir: string,
  platformHome: string,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
): Promise<ReadonlyArray<ManifestEntry>> {
  const skillsSrcDir = path.join(contentDir, 'skills');
  const dirEntries = await readdir(skillsSrcDir);
  const entries: Array<ManifestEntry> = [];

  for (const entry of dirEntries) {
    const srcPath = path.join(skillsSrcDir, entry);
    const destPath = path.join(skillsDestDir, entry);
    const relativePath = `skills/${entry}`;

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
      const drift = await detectDrift(existingEntry, platformHome);
      if (drift === 'modified') {
        console.warn(`  Skipping modified item: ${relativePath}`);
        entries.push(existingEntry);
        continue;
      }
    }

    await (options.link ? linkItem(srcPath, destPath) : copyItem(srcPath, destPath));

    const stats = await stat(srcPath);
    entries.push({
      relativePath,
      contentHash: stats.isDirectory() ? `sha256:dir:${relativePath}` : await computeContentHash(destPath),
      linked: options.link,
    });
  }

  return entries;
}

/**
 * Installs subagent .md files with platform-specific frontmatter merging.
 * If a previously installed item has been modified by the user, it is skipped unless
 * `--force` is set, mirroring the uninstall command's drift-checking behavior.
 */
async function installSubagents(
  contentDir: string,
  platformPaths: { platformHome: string; subagentsDir: string },
  platformId: PlatformId,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
): Promise<ReadonlyArray<ManifestEntry>> {
  const subagentsSrcDir = path.join(contentDir, 'subagents');
  const platformConfig = PLATFORMS[platformId];
  const overlayPath = path.join(subagentsSrcDir, '_data', platformConfig.frontmatterFile);

  let overlayYaml: string;
  try {
    overlayYaml = await readFile(overlayPath, 'utf8');
  } catch (error: unknown) {
    if (!isEnoent(error)) {
      throw error;
    }
    overlayYaml = '';
  }

  const dirEntries = await readdir(subagentsSrcDir);
  const subagentsDirName = platformConfig.subagentsDir;
  const entries: Array<ManifestEntry> = [];

  for (const entry of dirEntries) {
    if (entry === '_data' || !entry.endsWith('.md')) {
      continue;
    }

    const srcPath = path.join(subagentsSrcDir, entry);
    const destPath = path.join(platformPaths.subagentsDir, entry);
    const relativePath = `${subagentsDirName}/${entry}`;

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
      const drift = await detectDrift(existingEntry, platformPaths.platformHome);
      if (drift === 'modified') {
        console.warn(`  Skipping modified item: ${relativePath}`);
        entries.push(existingEntry);
        continue;
      }
    }

    // Read source, merge frontmatter, write to destination
    const source = await readFile(srcPath, 'utf8');
    const merged = mergeFrontmatter(source, overlayYaml);
    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, merged, 'utf8');

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
 * Type guard that checks whether an error is a Node.js ENOENT error.
 */
function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
