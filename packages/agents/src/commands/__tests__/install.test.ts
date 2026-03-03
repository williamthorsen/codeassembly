import { existsSync, lstatSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveContentDir } from '../../lib/content-resolver.js';
import { readManifest } from '../../lib/manifest.js';
import { getManifestPath } from '../../lib/manifest.js';
import type { InstallOptions } from '../../lib/types.js';
import { installCommand } from '../install.js';

describe('installCommand', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-install-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return {
      platform: 'claude',
      link: false,
      force: false,
      dryRun: false,
      ...overrides,
    };
  }

  it('should error when target skills directory is a symlink', async () => {
    // Set up the claude home directory with a symlinked skills dir
    const claudeHome = path.join(tempDir, '.claude');
    const realSkills = path.join(tempDir, 'real-skills');
    await mkdir(realSkills, { recursive: true });
    await mkdir(claudeHome, { recursive: true });
    await symlink(realSkills, path.join(claudeHome, 'skills'));

    await expect(installCommand(makeOptions(), tempDir)).rejects.toThrow('Target directory is a symlink');
  });

  it('should install skills and subagents in dry-run mode without writing files', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions({ dryRun: true }), tempDir);

    // Manifest should not have been created
    const manifestPath = getManifestPath(tempDir);
    expect(existsSync(manifestPath)).toBe(false);

    // Skills directory should be empty (nothing was installed)
    const skillsContents = await readdir(path.join(claudeHome, 'skills'));
    expect(skillsContents).toHaveLength(0);
  });

  it('should install skills and subagents with merged frontmatter', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions(), tempDir);

    // Check that skills were installed — count should match shared + platform-specific
    const contentDir = resolveContentDir();
    const allSkillEntries = await readdir(path.join(contentDir, 'skills'));
    const sharedSkillCount = allSkillEntries.filter((e) => !e.startsWith('_')).length;
    const platformSkillsDir = path.join(contentDir, 'skills', '_platforms', 'claude');
    const platformSkillCount = existsSync(platformSkillsDir)
      ? (await readdir(platformSkillsDir)).length
      : 0;
    const expectedSkillCount = sharedSkillCount + platformSkillCount;
    const skillsContents = await readdir(path.join(claudeHome, 'skills'));
    expect(skillsContents.length).toBe(expectedSkillCount);

    // Check that subagent files were installed with merged frontmatter
    const coderContent = await readFile(path.join(claudeHome, 'agents', 'orchestrated-coder.md'), 'utf8');
    expect(coderContent).toContain('permissionMode: bypassPermissions');
    expect(coderContent).toContain('model: inherit');
    expect(coderContent).toContain('memory: user');

    // Check manifest was written
    const manifestPath = getManifestPath(tempDir);
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = await readManifest(manifestPath);
    const claudeManifest = manifest.platforms.claude;
    expect(claudeManifest).toBeDefined();
    expect(claudeManifest?.entries.length).toBeGreaterThan(0);
  });

  it('should be idempotent - running twice produces the same result', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions(), tempDir);
    const firstContent = await readFile(path.join(claudeHome, 'agents', 'orchestrated-coder.md'), 'utf8');

    await installCommand(makeOptions(), tempDir);
    const secondContent = await readFile(path.join(claudeHome, 'agents', 'orchestrated-coder.md'), 'utf8');

    expect(secondContent).toBe(firstContent);
  });

  it('should skip modified subagent files on re-install without --force', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    // First install to establish manifest
    await installCommand(makeOptions(), tempDir);

    // Modify a subagent file after installation
    const agentPath = path.join(claudeHome, 'agents', 'orchestrated-coder.md');
    const originalContent = await readFile(agentPath, 'utf8');
    const modifiedContent = originalContent + '\n<!-- user modification -->\n';
    await writeFile(agentPath, modifiedContent, 'utf8');

    // Re-install without --force
    await installCommand(makeOptions(), tempDir);

    // Modified file should be preserved (not overwritten)
    const afterReinstall = await readFile(agentPath, 'utf8');
    expect(afterReinstall).toBe(modifiedContent);
  });

  it('should overwrite modified subagent files on re-install with --force', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    // First install to establish manifest
    await installCommand(makeOptions(), tempDir);

    // Modify a subagent file after installation
    const agentPath = path.join(claudeHome, 'agents', 'orchestrated-coder.md');
    const originalContent = await readFile(agentPath, 'utf8');
    const modifiedContent = originalContent + '\n<!-- user modification -->\n';
    await writeFile(agentPath, modifiedContent, 'utf8');

    // Re-install with --force
    await installCommand(makeOptions({ force: true }), tempDir);

    // Modified file should be overwritten back to the managed content
    const afterReinstall = await readFile(agentPath, 'utf8');
    expect(afterReinstall).not.toBe(modifiedContent);
    expect(afterReinstall).toBe(originalContent);
  });

  it('should install skills as symlinks when link mode is enabled', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions({ link: true }), tempDir);

    // Verify that at least one skill entry is a symlink
    const skillsContents = await readdir(path.join(claudeHome, 'skills'));
    expect(skillsContents.length).toBeGreaterThan(0);

    const firstSkillName = skillsContents[0];
    if (firstSkillName === undefined) {
      throw new Error('Expected at least one skill entry');
    }
    const firstSkill = path.join(claudeHome, 'skills', firstSkillName);
    const stats = lstatSync(firstSkill);
    expect(stats.isSymbolicLink()).toBe(true);

    // Verify manifest records skill entries as linked
    const manifest = await readManifest(getManifestPath(tempDir));
    const claudeManifest = manifest.platforms.claude;
    expect(claudeManifest).toBeDefined();
    const linkedEntries = claudeManifest?.entries.filter((e) => e.linked);
    expect(linkedEntries?.length).toBeGreaterThan(0);

    // Verify subagent entries always have linked: false (they require frontmatter merging)
    const subagentEntries = claudeManifest?.entries.filter((e) => e.relativePath.startsWith('agents/'));
    expect(subagentEntries?.length).toBeGreaterThan(0);
    for (const entry of subagentEntries ?? []) {
      expect(entry.linked).toBe(false);
    }

    // Verify an installed subagent file is a regular file, not a symlink
    const firstSubagentEntry = subagentEntries?.[0];
    if (firstSubagentEntry === undefined) {
      throw new Error('Expected at least one subagent entry');
    }
    const subagentFilePath = path.join(claudeHome, firstSubagentEntry.relativePath);
    const subagentStats = lstatSync(subagentFilePath);
    expect(subagentStats.isSymbolicLink()).toBe(false);
  });

  it('should install claude-specific skills and exclude rovodev-specific skills', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions({ platform: 'claude' }), tempDir);

    const skillsContents = await readdir(path.join(claudeHome, 'skills'));
    // Claude gets review-permissions (claude-specific)
    expect(skillsContents).toContain('review-permissions');
    // Claude does NOT get rovodev-specific skills
    expect(skillsContents).not.toContain('brainstorming');
    expect(skillsContents).not.toContain('systematic-debugging');
  });

  it('should install rovodev-specific skills and exclude claude-specific skills', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    await installCommand(makeOptions({ platform: 'rovodev' }), tempDir);

    const skillsContents = await readdir(path.join(rovodevHome, 'skills'));
    // Rovodev gets brainstorming and systematic-debugging (rovodev-specific)
    expect(skillsContents).toContain('brainstorming');
    expect(skillsContents).toContain('systematic-debugging');
    // Rovodev does NOT get claude-specific skills
    expect(skillsContents).not.toContain('review-permissions');
  });

  it('should not install _platforms directory into target skills', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions({ platform: 'claude' }), tempDir);

    const skillsContents = await readdir(path.join(claudeHome, 'skills'));
    expect(skillsContents).not.toContain('_platforms');
    expect(skillsContents).not.toContain('_data');
  });

  it('should generate prompts.yml for rovodev', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    await installCommand(makeOptions({ platform: 'rovodev' }), tempDir);

    const promptsPath = path.join(rovodevHome, 'prompts.yml');
    expect(existsSync(promptsPath)).toBe(true);

    const content = await readFile(promptsPath, 'utf8');
    // systematic-debugging has no user-invocable field (default = included)
    expect(content).toContain('systematic-debugging');
    // brainstorming has user-invocable: false (should be excluded)
    expect(content).not.toContain('brainstorming');
    // Verify YAML structure
    expect(content).toMatch(/^prompts:\n/);
    expect(content).toContain('content_file:');
  });

  it('should track prompts.yml in the manifest for rovodev', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    await installCommand(makeOptions({ platform: 'rovodev' }), tempDir);

    const manifest = await readManifest(getManifestPath(tempDir));
    const rovodevManifest = manifest.platforms.rovodev;
    expect(rovodevManifest).toBeDefined();

    const promptsEntry = rovodevManifest?.entries.find((e) => e.relativePath === 'prompts.yml');
    expect(promptsEntry).toBeDefined();
    expect(promptsEntry?.linked).toBe(false);
    expect(promptsEntry?.contentHash).toMatch(/^sha256:/);
  });

  it('should NOT generate prompts.yml for claude', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions({ platform: 'claude' }), tempDir);

    const promptsPath = path.join(claudeHome, 'prompts.yml');
    expect(existsSync(promptsPath)).toBe(false);
  });

  it('should install platform-specific skills as symlinks in link mode', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions({ platform: 'claude', link: true }), tempDir);

    // Verify review-permissions (claude platform-specific) is installed as a symlink
    const reviewPermissionsPath = path.join(claudeHome, 'skills', 'review-permissions');
    const stats = lstatSync(reviewPermissionsPath);
    expect(stats.isSymbolicLink()).toBe(true);

    // Verify the manifest records it as linked
    const manifest = await readManifest(getManifestPath(tempDir));
    const claudeManifest = manifest.platforms.claude;
    expect(claudeManifest).toBeDefined();
    const reviewPermEntry = claudeManifest?.entries.find((e) => e.relativePath === 'skills/review-permissions');
    expect(reviewPermEntry).toBeDefined();
    expect(reviewPermEntry?.linked).toBe(true);
  });
});
