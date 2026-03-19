import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveContentDir } from '../lib/content-resolver.js';
import { mergeFrontmatter, parseFrontmatter } from '../lib/frontmatter-merger.js';
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

    // Install skills (shared + platform-specific)
    const skillEntries = await installSkills(
      contentDir,
      paths.skillsDir,
      paths.platformHome,
      existingByPath,
      options,
      platformId,
    );
    entries.push(...skillEntries);

    // Install subagents with merged frontmatter
    const subagentEntries = await installSubagents(contentDir, paths, platformId, existingByPath, options);
    entries.push(...subagentEntries);

    // Generate prompts.yml for Rovo Dev (skill discovery file)
    if (platformId === 'rovodev') {
      const promptsEntry = await generatePromptsYml(paths, existingByPath, options);
      if (promptsEntry) {
        entries.push(promptsEntry);
      }
    }

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
 * Shared skills (top-level entries) are installed for all platforms. Platform-specific
 * skills from `_platforms/{platformId}/` are installed only for the matching platform.
 * The `_platforms` directory is skipped (handled by dedicated platform-specific logic below).
 *
 * If a previously installed item has been modified by the user, it is skipped unless
 * `--force` is set, mirroring the uninstall command's drift-checking behavior.
 */
async function installSkills(
  contentDir: string,
  skillsDestDir: string,
  platformHome: string,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
  platformId: PlatformId,
): Promise<ReadonlyArray<ManifestEntry>> {
  const skillsSrcDir = path.join(contentDir, 'skills');
  const dirEntries = await readdir(skillsSrcDir);
  const entries: Array<ManifestEntry> = [];

  // Install shared skills and support directories (skip only _platforms, handled below)
  for (const entry of dirEntries) {
    if (entry === '_platforms') {
      continue;
    }
    const result = await installSkillEntry(
      path.join(skillsSrcDir, entry),
      path.join(skillsDestDir, entry),
      `skills/${entry}`,
      platformHome,
      existingByPath,
      options,
    );
    entries.push(result);
  }

  // Install platform-specific skills from _platforms/{platformId}/
  const platformSkillsSrcDir = path.join(skillsSrcDir, '_platforms', platformId);
  let platformDirEntries: ReadonlyArray<string>;
  try {
    platformDirEntries = await readdir(platformSkillsSrcDir);
  } catch (error: unknown) {
    if (!isEnoent(error)) {
      throw error;
    }
    console.warn(`  Warning: no platform-specific skills directory found for ${platformId}: ${platformSkillsSrcDir}`);
    platformDirEntries = [];
  }

  for (const entry of platformDirEntries) {
    const result = await installSkillEntry(
      path.join(platformSkillsSrcDir, entry),
      path.join(skillsDestDir, entry),
      `skills/${entry}`,
      platformHome,
      existingByPath,
      options,
      '(platform-specific)',
    );
    entries.push(result);
  }

  return entries;
}

/**
 * Installs a single skill entry (directory or file) from source to destination.
 * Handles dry-run mode, drift detection for previously installed items, and
 * copy/link based on install options. Used by `installSkills` for both shared
 * and platform-specific skill entries.
 */
async function installSkillEntry(
  srcPath: string,
  destPath: string,
  relativePath: string,
  platformHome: string,
  existingByPath: ReadonlyMap<string, ManifestEntry>,
  options: InstallOptions,
  label = '',
): Promise<ManifestEntry> {
  if (options.dryRun) {
    const action = options.link ? 'link' : 'copy';
    console.info(`    [${action}] ${relativePath}${label ? ` ${label}` : ''}`);
    return { relativePath, contentHash: 'dry-run', linked: options.link };
  }

  // Check for user modifications before overwriting
  const existingEntry = existingByPath.get(relativePath);
  if (existingEntry && !options.force) {
    const drift = await detectDrift(existingEntry, platformHome);
    if (drift === 'modified') {
      console.warn(`  Skipping modified item: ${relativePath}`);
      return existingEntry;
    }
  }

  await (options.link ? linkItem(srcPath, destPath) : copyItem(srcPath, destPath));

  const stats = await stat(srcPath);
  return {
    relativePath,
    contentHash: stats.isDirectory() ? `sha256:dir:${relativePath}` : await computeContentHash(destPath),
    linked: options.link,
  };
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
 * Generates `prompts.yml` for Rovo Dev, which is the skill discovery file that lists
 * all user-invocable skills. Skills with `user-invocable: false` are excluded.
 *
 * The file is written to `{platformHome}/prompts.yml` and tracked in the manifest.
 */
async function generatePromptsYml(
  paths: { platformHome: string; skillsDir: string },
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
    console.warn(`  Warning: skills directory not found, skipping prompts.yml generation: ${paths.skillsDir}`);
    return undefined;
  }

  // eslint-disable-next-line n/no-unsupported-features/es-syntax -- project requires Node 22+
  const sortedSkillNames = [...skillDirEntries].toSorted();

  const promptEntries: Array<{ name: string; description: string; contentFile: string }> = [];

  for (const skillName of sortedSkillNames) {
    const skillMdPath = path.join(paths.skillsDir, skillName, 'SKILL.md');
    let skillContent: string;
    try {
      skillContent = await readFile(skillMdPath, 'utf8');
    } catch (error: unknown) {
      if (!isEnoent(error)) {
        throw error;
      }
      continue;
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

  // Build YAML content with deterministic template literals.
  // Description values are single-quoted with internal single quotes escaped (doubled)
  // to prevent YAML-special characters from producing invalid output.
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
    const drift = await detectDrift(existingEntry, paths.platformHome);
    if (drift === 'modified') {
      console.warn(`  Skipping modified item: ${relativePath}`);
      return existingEntry;
    }
  }

  // Ensure platform home directory exists
  await mkdir(paths.platformHome, { recursive: true });

  const destPath = path.join(paths.platformHome, relativePath);
  await writeFile(destPath, yamlContent, 'utf8');

  const hash = await computeContentHash(destPath);
  return {
    relativePath,
    contentHash: hash,
    linked: false,
  };
}

/**
 * Type guard that checks whether an error is a Node.js ENOENT error.
 */
function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
