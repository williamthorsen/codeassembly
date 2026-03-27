import { existsSync, lstatSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import yaml from 'js-yaml';
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
    const sharedSkillCount = allSkillEntries.filter((e) => e !== '_platforms' && !e.startsWith('.')).length;
    const platformSkillsDir = path.join(contentDir, 'skills', '_platforms', 'claude');
    const platformSkillEntries = existsSync(platformSkillsDir) ? await readdir(platformSkillsDir) : [];
    const platformSkillCount = platformSkillEntries.filter((e) => !e.startsWith('.')).length;
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

  it('should install _data support directory but not _platforms', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions({ platform: 'claude' }), tempDir);

    const skillsContents = await readdir(path.join(claudeHome, 'skills'));
    expect(skillsContents).not.toContain('_platforms');
    expect(skillsContents).toContain('_data');

    // Verify _data contents are present
    const dataContents = await readdir(path.join(claudeHome, 'skills', '_data'));
    expect(dataContents).toContain('artifact-conventions.md');
    expect(dataContents).toContain('next-steps-after-plan.md');
    expect(dataContents).toContain('commit-format.md');
  });

  it('should generate prompts.yml for rovodev with valid YAML structure', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    await installCommand(makeOptions({ platform: 'rovodev' }), tempDir);

    const promptsPath = path.join(rovodevHome, 'prompts.yml');
    expect(existsSync(promptsPath)).toBe(true);

    const content = await readFile(promptsPath, 'utf8');

    // Parse as YAML to verify structural validity
    const parsed: unknown = yaml.load(content);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
    expect(parsed !== null).toBe(true);

    // Narrow to record shape at runtime to satisfy no-type-assertions lint rule
    if (typeof parsed !== 'object' || parsed === null || !('prompts' in parsed)) {
      throw new Error('Expected parsed YAML to have a prompts key');
    }
    const doc = parsed;
    expect(Array.isArray(doc.prompts)).toBe(true);
    if (!Array.isArray(doc.prompts)) {
      throw new TypeError('Expected prompts to be an array');
    }
    const prompts: Array<unknown> = doc.prompts;
    expect(prompts.length).toBeGreaterThan(0);

    // Verify each entry has the expected shape
    for (const entry of prompts) {
      if (typeof entry !== 'object' || entry === null) {
        throw new Error('Expected each prompt entry to be an object');
      }
      if (!('name' in entry) || !('description' in entry) || !('content_file' in entry)) {
        throw new Error('Expected each prompt entry to have name, description, and content_file');
      }
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.description).toBe('string');
      expect(typeof entry.content_file).toBe('string');
    }

    // Extract skill names for filtering assertions
    const skillNames = prompts.map((e) => {
      if (typeof e !== 'object' || e === null || !('name' in e)) {
        throw new Error('Expected prompt entry with name');
      }
      return e.name;
    });

    // systematic-debugging has no user-invocable field (default = included)
    expect(skillNames).toContain('systematic-debugging');
    // brainstorming has user-invocable: false (should be excluded)
    expect(skillNames).not.toContain('brainstorming');

    // Shared skills with user-invocable: false should be excluded
    expect(skillNames).not.toContain('anti-patterns');
    expect(skillNames).not.toContain('common-mistakes');
    expect(skillNames).not.toContain('collaboration');
    expect(skillNames).not.toContain('orchestrate');

    // Shared skills with user-invocable: true should be included
    expect(skillNames).toContain('orchestrate-dev');
    expect(skillNames).toContain('create-pr');
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

  it('should skip modified shared skill on re-install without --force (rovodev)', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    // First install to establish manifest
    await installCommand(makeOptions({ platform: 'rovodev' }), tempDir);

    // Modify a subagent file after installation (subagents are single files with
    // content hashes, so drift detection works reliably)
    const agentPath = path.join(rovodevHome, 'subagents', 'orchestrated-coder.md');
    const originalContent = await readFile(agentPath, 'utf8');
    const modifiedContent = originalContent + '\n<!-- user modification -->\n';
    await writeFile(agentPath, modifiedContent, 'utf8');

    // Re-install without --force
    await installCommand(makeOptions({ platform: 'rovodev' }), tempDir);

    // Modified file should be preserved (not overwritten)
    const afterReinstall = await readFile(agentPath, 'utf8');
    expect(afterReinstall).toBe(modifiedContent);
  });

  it('should overwrite modified subagent on re-install with --force (rovodev)', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    // First install to establish manifest
    await installCommand(makeOptions({ platform: 'rovodev' }), tempDir);

    // Modify a subagent file after installation
    const agentPath = path.join(rovodevHome, 'subagents', 'orchestrated-coder.md');
    const originalContent = await readFile(agentPath, 'utf8');
    const modifiedContent = originalContent + '\n<!-- user modification -->\n';
    await writeFile(agentPath, modifiedContent, 'utf8');

    // Re-install with --force
    await installCommand(makeOptions({ platform: 'rovodev', force: true }), tempDir);

    // Modified file should be overwritten back to the managed content
    const afterReinstall = await readFile(agentPath, 'utf8');
    expect(afterReinstall).not.toBe(modifiedContent);
    expect(afterReinstall).toBe(originalContent);
  });

  it('should skip modified prompts.yml on re-install without --force', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    // First install to establish manifest
    await installCommand(makeOptions({ platform: 'rovodev' }), tempDir);

    // Modify prompts.yml after installation
    const promptsPath = path.join(rovodevHome, 'prompts.yml');
    const originalContent = await readFile(promptsPath, 'utf8');
    const modifiedContent = originalContent + '# user modification\n';
    await writeFile(promptsPath, modifiedContent, 'utf8');

    // Re-install without --force
    await installCommand(makeOptions({ platform: 'rovodev' }), tempDir);

    // Modified file should be preserved (not overwritten)
    const afterReinstall = await readFile(promptsPath, 'utf8');
    expect(afterReinstall).toBe(modifiedContent);
  });

  it('should regenerate modified prompts.yml on re-install with --force', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    // First install to establish manifest
    await installCommand(makeOptions({ platform: 'rovodev' }), tempDir);

    // Modify prompts.yml after installation
    const promptsPath = path.join(rovodevHome, 'prompts.yml');
    const originalContent = await readFile(promptsPath, 'utf8');
    const modifiedContent = originalContent + '# user modification\n';
    await writeFile(promptsPath, modifiedContent, 'utf8');

    // Re-install with --force
    await installCommand(makeOptions({ platform: 'rovodev', force: true }), tempDir);

    // Modified file should be overwritten (regenerated)
    const afterReinstall = await readFile(promptsPath, 'utf8');
    expect(afterReinstall).not.toBe(modifiedContent);
    expect(afterReinstall).toBe(originalContent);
  });

  it('should install rovodev in dry-run mode without writing prompts.yml or manifest', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    await installCommand(makeOptions({ platform: 'rovodev', dryRun: true }), tempDir);

    // Manifest should not have been created
    const manifestPath = getManifestPath(tempDir);
    expect(existsSync(manifestPath)).toBe(false);

    // Skills directory should be empty (nothing was installed)
    const skillsContents = await readdir(path.join(rovodevHome, 'skills'));
    expect(skillsContents).toHaveLength(0);

    // prompts.yml should not have been created
    const promptsPath = path.join(rovodevHome, 'prompts.yml');
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

  it('should strip surrounding quotes from skill descriptions in prompts.yml', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    // First install to create the initial prompts.yml and manifest
    await installCommand(makeOptions({ platform: 'rovodev' }), tempDir);

    // Write a synthetic skill with a single-quoted description containing an escaped apostrophe.
    // This exercises the quote-stripping code path in generatePromptsYml.
    const syntheticSkillDir = path.join(rovodevHome, 'skills', 'synthetic-quoted');
    await mkdir(syntheticSkillDir, { recursive: true });
    await writeFile(
      path.join(syntheticSkillDir, 'SKILL.md'),
      "---\nname: synthetic-quoted\ndescription: 'A skill with an apostrophe: it''s useful'\nuser-invocable: true\n---\n\n# Synthetic quoted skill\n\nTest content.\n",
      'utf8',
    );

    // Also write a skill with double-quoted description
    const doubleQuotedSkillDir = path.join(rovodevHome, 'skills', 'synthetic-double-quoted');
    await mkdir(doubleQuotedSkillDir, { recursive: true });
    await writeFile(
      path.join(doubleQuotedSkillDir, 'SKILL.md'),
      '---\nname: synthetic-double-quoted\ndescription: "A double-quoted description"\nuser-invocable: true\n---\n\n# Synthetic double-quoted skill\n\nTest content.\n',
      'utf8',
    );

    // Re-install with --force to regenerate prompts.yml with the new skills
    await installCommand(makeOptions({ platform: 'rovodev', force: true }), tempDir);

    const promptsPath = path.join(rovodevHome, 'prompts.yml');
    const content = await readFile(promptsPath, 'utf8');

    // Parse as YAML and find the synthetic entries
    const parsed: unknown = yaml.load(content);
    if (typeof parsed !== 'object' || parsed === null || !('prompts' in parsed)) {
      throw new Error('Expected parsed YAML to have a prompts key');
    }
    const doc = parsed;
    if (!Array.isArray(doc.prompts)) {
      throw new TypeError('Expected prompts to be an array');
    }
    const prompts: Array<unknown> = doc.prompts;

    // Find the single-quoted synthetic skill entry
    const singleQuotedEntry = prompts.find(
      (e) => typeof e === 'object' && e !== null && 'name' in e && e.name === 'synthetic-quoted',
    );
    if (typeof singleQuotedEntry !== 'object' || singleQuotedEntry === null || !('description' in singleQuotedEntry)) {
      throw new Error('Expected synthetic-quoted entry with description');
    }
    // The surrounding quotes should be stripped and the escaped apostrophe should be present
    // (YAML parsing handles the '' -> ' unescaping in the final output)
    expect(singleQuotedEntry.description).toBe("A skill with an apostrophe: it's useful");

    // Find the double-quoted synthetic skill entry
    const doubleQuotedEntry = prompts.find(
      (e) => typeof e === 'object' && e !== null && 'name' in e && e.name === 'synthetic-double-quoted',
    );
    if (typeof doubleQuotedEntry !== 'object' || doubleQuotedEntry === null || !('description' in doubleQuotedEntry)) {
      throw new Error('Expected synthetic-double-quoted entry with description');
    }
    // The surrounding double quotes should be stripped
    expect(doubleQuotedEntry.description).toBe('A double-quoted description');
  });

  it('should rewrite relative Markdown link paths to absolute in copy mode', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions(), tempDir);

    // code-patterns SKILL.md has a Markdown link: [naming-conventions.md](../_data/naming-conventions.md)
    const codePatternSkillPath = path.join(claudeHome, 'skills', 'code-patterns', 'SKILL.md');
    const content = await readFile(codePatternSkillPath, 'utf8');

    // Relative Markdown link paths should have been rewritten to ~/... absolute paths
    expect(content).toContain('~/.claude/skills/_data/naming-conventions.md');

    // No remaining relative ../_data/ Markdown link references should exist
    expect(content).not.toMatch(/\]\(\.\.\/_data\//);
  });

  it('should preserve anchor fragments in rewritten paths', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions(), tempDir);

    // review-criteria has a link with an anchor fragment:
    // [artifact conventions](../_data/artifact-conventions.md#finding-scheme-fwtrs--legacy-suffix)
    const reviewCriteriaPath = path.join(claudeHome, 'skills', 'review-criteria', 'SKILL.md');
    const content = await readFile(reviewCriteriaPath, 'utf8');

    // Anchor fragment should be preserved in the rewritten path
    expect(content).toContain('~/.claude/skills/_data/artifact-conventions.md#finding-scheme-fwtrs--legacy-suffix');
  });

  it('should not rewrite paths in link mode', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions({ link: true }), tempDir);

    // In link mode, skills are installed as symlinks pointing to the source directory.
    // The rewriter should not run, so the source files remain unchanged.
    const codePatternSkillPath = path.join(claudeHome, 'skills', 'code-patterns');
    const stats = lstatSync(codePatternSkillPath);
    expect(stats.isSymbolicLink()).toBe(true);

    // Verify that the original source file still has relative paths (not rewritten)
    const contentDir = resolveContentDir();
    const sourceContent = await readFile(path.join(contentDir, 'skills', 'code-patterns', 'SKILL.md'), 'utf8');
    expect(sourceContent).toContain('../_data/naming-conventions.md');
  });
});
