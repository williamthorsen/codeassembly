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

    // Check that skills were installed — count should match source content
    const contentDir = resolveContentDir();
    const expectedSkillCount = (await readdir(path.join(contentDir, 'skills'))).length;
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
});
