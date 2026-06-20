import { existsSync, lstatSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { resolveContentDir } from '../../lib/content-resolver.ts';
import { readManifest } from '../../lib/manifest.ts';
import { getManifestPath } from '../../lib/manifest.ts';
import { isRecord } from '../../lib/type-guards.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';

describe(installCommand, () => {
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
      harness: 'claude',
      link: false,
      force: false,
      dryRun: false,
      ...overrides,
    };
  }

  it('throws when target skills directory is a symlink', async () => {
    // Set up the claude home directory with a symlinked skills dir
    const claudeHome = path.join(tempDir, '.claude');
    const realSkills = path.join(tempDir, 'real-skills');
    await mkdir(realSkills, { recursive: true });
    await mkdir(claudeHome, { recursive: true });
    await symlink(realSkills, path.join(claudeHome, 'skills'));

    await expect(installCommand(makeOptions(), tempDir)).rejects.toThrow('Target directory is a symlink');
  });

  it('installs skills and subagents in dry-run mode without writing files', async () => {
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

  it('installs skills and subagents with merged frontmatter', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions(), tempDir);

    // Check that skills were installed — count should match shared + harness-specific
    const contentDir = resolveContentDir();
    const allSkillEntries = await readdir(path.join(contentDir, 'skills'));
    // Mirror the install enumeration's skip set: `_harnesses` and `_partials` are excluded, dotfiles too.
    const sharedSkillCount = allSkillEntries.filter(
      (e) => e !== '_harnesses' && e !== '_partials' && !e.startsWith('.'),
    ).length;
    const harnessSkillsDir = path.join(contentDir, 'skills', '_harnesses', 'claude');
    const harnessSkillEntries = existsSync(harnessSkillsDir) ? await readdir(harnessSkillsDir) : [];
    const harnessSkillCount = harnessSkillEntries.filter((e) => !e.startsWith('.')).length;
    const expectedSkillCount = sharedSkillCount + harnessSkillCount;
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
    const claudeManifest = manifest.harnesses.claude;
    expect(claudeManifest).toBeDefined();
    expect(claudeManifest?.entries.length).toBeGreaterThan(0);
  });

  it('is idempotent', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions(), tempDir);
    const firstContent = await readFile(path.join(claudeHome, 'agents', 'orchestrated-coder.md'), 'utf8');

    await installCommand(makeOptions(), tempDir);
    const secondContent = await readFile(path.join(claudeHome, 'agents', 'orchestrated-coder.md'), 'utf8');

    expect(secondContent).toBe(firstContent);
  });

  describe('subagent script-path expansion', () => {
    it.each([
      { harness: 'claude' as const, home: '.claude', subagentsSubdir: 'agents' },
      { harness: 'rovodev' as const, home: '.rovodev', subagentsSubdir: 'subagents' },
    ])(
      'when installing for $harness, no installed subagent retains a raw {harness_home_dir} token',
      async ({ harness, home, subagentsSubdir }) => {
        const harnessHome = path.join(tempDir, home);
        await mkdir(path.join(harnessHome, 'skills'), { recursive: true });
        await mkdir(path.join(harnessHome, subagentsSubdir), { recursive: true });

        await installCommand(makeOptions({ harness }), tempDir);

        const installedDir = path.join(harnessHome, subagentsSubdir);
        const subagentFiles = (await readdir(installedDir)).filter((file) => file.endsWith('.md'));
        expect(subagentFiles.length).toBeGreaterThan(0);

        const offenders: Array<string> = [];
        for (const file of subagentFiles) {
          const content = await readFile(path.join(installedDir, file), 'utf8');
          if (content.includes('{harness_home_dir}')) {
            offenders.push(file);
          }
        }
        expect(offenders).toEqual([]);
      },
    );

    it('when installing for claude, expands a subagent script token to a tilde-absolute harness path', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const coderContent = await readFile(path.join(claudeHome, 'agents', 'orchestrated-coder.md'), 'utf8');
      expect(coderContent).toContain('~/.claude/scripts/describe-change.sh');
    });
  });

  it('skips modified subagent files on re-install without --force', async () => {
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

  it('prefixes warn lines with ⚠️ and success summary lines with ✅', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    // First install to establish manifest, then modify a subagent so the next install emits a skip warning
    await installCommand(makeOptions(), tempDir);
    const agentPath = path.join(claudeHome, 'agents', 'orchestrated-coder.md');
    const originalContent = await readFile(agentPath, 'utf8');
    await writeFile(agentPath, `${originalContent}\n<!-- user modification -->\n`, 'utf8');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    let warnLines: ReadonlyArray<string>;
    let infoLines: ReadonlyArray<string>;
    try {
      await installCommand(makeOptions(), tempDir);
      warnLines = warnSpy.mock.calls.map((call) => String(call[0]));
      infoLines = infoSpy.mock.calls.map((call) => String(call[0]));
    } finally {
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    }

    expect(warnLines.some((line) => line.includes('⚠️ Skipping modified'))).toBe(true);
    expect(infoLines.some((line) => line.includes('✅ Installed '))).toBe(true);
  });

  it('overwrites modified subagent files on re-install with --force', async () => {
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

  it('copies skills even when link mode is enabled', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions({ link: true }), tempDir);

    // Skills require path transformation, so they are always copied (never symlinked)
    const skillsContents = await readdir(path.join(claudeHome, 'skills'));
    expect(skillsContents.length).toBeGreaterThan(0);

    const firstSkillName = skillsContents[0];
    if (firstSkillName === undefined) {
      throw new Error('Expected at least one skill entry');
    }
    const firstSkill = path.join(claudeHome, 'skills', firstSkillName);
    const stats = lstatSync(firstSkill);
    expect(stats.isSymbolicLink()).toBe(false);

    // Verify manifest records skill entries as not linked
    const manifest = await readManifest(getManifestPath(tempDir));
    const claudeManifest = manifest.harnesses.claude;
    expect(claudeManifest).toBeDefined();
    const skillEntries = claudeManifest?.entries.filter((e) => e.relativePath.startsWith('skills/'));
    expect(skillEntries?.length).toBeGreaterThan(0);
    for (const entry of skillEntries ?? []) {
      expect(entry.linked).toBe(false);
    }

    // Verify subagent entries also have linked: false (they require frontmatter merging)
    const subagentEntries = claudeManifest?.entries.filter((e) => e.relativePath.startsWith('agents/'));
    expect(subagentEntries?.length).toBeGreaterThan(0);
    for (const entry of subagentEntries ?? []) {
      expect(entry.linked).toBe(false);
    }

    // Verify scripts are still symlinked in link mode
    const scriptEntries = claudeManifest?.entries.filter((e) => e.relativePath.startsWith('scripts/'));
    expect(scriptEntries?.length).toBeGreaterThan(0);
    for (const entry of scriptEntries ?? []) {
      expect(entry.linked).toBe(true);
    }
  });

  it('installs claude-specific skills and exclude rovodev-specific skills', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);

    const skillsContents = await readdir(path.join(claudeHome, 'skills'));
    // Claude gets review-permissions (claude-specific)
    expect(skillsContents).toContain('review-permissions');
    // Claude does NOT get rovodev-specific skills
    expect(skillsContents).not.toContain('brainstorming');
    expect(skillsContents).not.toContain('systematic-debugging');
  });

  it('installs rovodev-specific skills and excludes claude-specific skills', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    await installCommand(makeOptions({ harness: 'rovodev' }), tempDir);

    const skillsContents = await readdir(path.join(rovodevHome, 'skills'));
    // Rovodev gets brainstorming and systematic-debugging (rovodev-specific)
    expect(skillsContents).toContain('brainstorming');
    expect(skillsContents).toContain('systematic-debugging');
    // Rovodev does NOT get claude-specific skills
    expect(skillsContents).not.toContain('review-permissions');
  });

  it('installs _data support directory but not _harnesses', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);

    const skillsContents = await readdir(path.join(claudeHome, 'skills'));
    expect(skillsContents).not.toContain('_harnesses');
    expect(skillsContents).toContain('_data');

    // Verify _data contents are present
    const dataContents = await readdir(path.join(claudeHome, 'skills', '_data'));
    expect(dataContents).toContain('artifact-conventions.md');
    expect(dataContents).toContain('next-steps-after-plan.md');
    expect(dataContents).toContain('title-templates.md');
  });

  it('generates prompts.yml for rovodev with valid YAML structure', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    await installCommand(makeOptions({ harness: 'rovodev' }), tempDir);

    const promptsPath = path.join(rovodevHome, 'prompts.yml');
    expect(existsSync(promptsPath)).toBe(true);

    const content = await readFile(promptsPath, 'utf8');

    // Parse as YAML to verify structural validity
    const parsed: unknown = parseYaml(content);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
    expect(parsed !== null).toBe(true);

    if (!isRecord(parsed) || !('prompts' in parsed)) {
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

  it('tolerates stray entries (e.g. .DS_Store) in the destination skills directory', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    const rovodevSkills = path.join(rovodevHome, 'skills');
    await mkdir(rovodevSkills, { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    // Both stray entries exercise the same path: joining `SKILL.md` onto a regular file raises ENOTDIR,
    // which the catch swallows. The two shapes (dotfile + plain) cover the common (.DS_Store) and the
    // general (any non-directory entry) cases through one mechanism.
    await writeFile(path.join(rovodevSkills, '.DS_Store'), '', 'utf8');
    await writeFile(path.join(rovodevSkills, 'stray-file'), '', 'utf8');

    await expect(installCommand(makeOptions({ harness: 'rovodev' }), tempDir)).resolves.toBeUndefined();

    const promptsPath = path.join(rovodevHome, 'prompts.yml');
    const content = await readFile(promptsPath, 'utf8');
    const parsed: unknown = parseYaml(content);

    if (typeof parsed !== 'object' || parsed === null || !('prompts' in parsed)) {
      throw new Error('Expected parsed YAML to have a prompts key');
    }
    if (!Array.isArray(parsed.prompts)) {
      throw new TypeError('Expected prompts to be an array');
    }
    const prompts: Array<unknown> = parsed.prompts;
    const skillNames = prompts.map((entry) => {
      if (typeof entry !== 'object' || entry === null || !('name' in entry)) {
        throw new Error('Expected prompt entry with name');
      }
      return entry.name;
    });

    expect(prompts.length).toBeGreaterThan(0);
    expect(skillNames).not.toContain('.DS_Store');
    expect(skillNames).not.toContain('stray-file');
  });

  it('tracks prompts.yml in the manifest for rovodev', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    await installCommand(makeOptions({ harness: 'rovodev' }), tempDir);

    const manifest = await readManifest(getManifestPath(tempDir));
    const rovodevManifest = manifest.harnesses.rovodev;
    expect(rovodevManifest).toBeDefined();

    const promptsEntry = rovodevManifest?.entries.find((e) => e.relativePath === 'prompts.yml');
    expect(promptsEntry).toBeDefined();
    expect(promptsEntry?.linked).toBe(false);
    expect(promptsEntry?.contentHash).toMatch(/^sha256:/);
  });

  it('does NOT generate prompts.yml for claude', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);

    const promptsPath = path.join(claudeHome, 'prompts.yml');
    expect(existsSync(promptsPath)).toBe(false);
  });

  it('skips modified shared skill on re-install without --force (rovodev)', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    // First install to establish manifest
    await installCommand(makeOptions({ harness: 'rovodev' }), tempDir);

    // Modify a subagent file after installation (subagents are single files with
    // content hashes, so drift detection works reliably)
    const agentPath = path.join(rovodevHome, 'subagents', 'orchestrated-coder.md');
    const originalContent = await readFile(agentPath, 'utf8');
    const modifiedContent = originalContent + '\n<!-- user modification -->\n';
    await writeFile(agentPath, modifiedContent, 'utf8');

    // Re-install without --force
    await installCommand(makeOptions({ harness: 'rovodev' }), tempDir);

    // Modified file should be preserved (not overwritten)
    const afterReinstall = await readFile(agentPath, 'utf8');
    expect(afterReinstall).toBe(modifiedContent);
  });

  it('overwrites modified subagent on re-install with --force (rovodev)', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    // First install to establish manifest
    await installCommand(makeOptions({ harness: 'rovodev' }), tempDir);

    // Modify a subagent file after installation
    const agentPath = path.join(rovodevHome, 'subagents', 'orchestrated-coder.md');
    const originalContent = await readFile(agentPath, 'utf8');
    const modifiedContent = originalContent + '\n<!-- user modification -->\n';
    await writeFile(agentPath, modifiedContent, 'utf8');

    // Re-install with --force
    await installCommand(makeOptions({ harness: 'rovodev', force: true }), tempDir);

    // Modified file should be overwritten back to the managed content
    const afterReinstall = await readFile(agentPath, 'utf8');
    expect(afterReinstall).not.toBe(modifiedContent);
    expect(afterReinstall).toBe(originalContent);
  });

  it('skips modified prompts.yml on re-install without --force', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    // First install to establish manifest
    await installCommand(makeOptions({ harness: 'rovodev' }), tempDir);

    // Modify prompts.yml after installation
    const promptsPath = path.join(rovodevHome, 'prompts.yml');
    const originalContent = await readFile(promptsPath, 'utf8');
    const modifiedContent = originalContent + '# user modification\n';
    await writeFile(promptsPath, modifiedContent, 'utf8');

    // Re-install without --force
    await installCommand(makeOptions({ harness: 'rovodev' }), tempDir);

    // Modified file should be preserved (not overwritten)
    const afterReinstall = await readFile(promptsPath, 'utf8');
    expect(afterReinstall).toBe(modifiedContent);
  });

  it('regenerates modified prompts.yml on re-install with --force', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    // First install to establish manifest
    await installCommand(makeOptions({ harness: 'rovodev' }), tempDir);

    // Modify prompts.yml after installation
    const promptsPath = path.join(rovodevHome, 'prompts.yml');
    const originalContent = await readFile(promptsPath, 'utf8');
    const modifiedContent = originalContent + '# user modification\n';
    await writeFile(promptsPath, modifiedContent, 'utf8');

    // Re-install with --force
    await installCommand(makeOptions({ harness: 'rovodev', force: true }), tempDir);

    // Modified file should be overwritten (regenerated)
    const afterReinstall = await readFile(promptsPath, 'utf8');
    expect(afterReinstall).not.toBe(modifiedContent);
    expect(afterReinstall).toBe(originalContent);
  });

  it('installs rovodev in dry-run mode without writing prompts.yml or manifest', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    await installCommand(makeOptions({ harness: 'rovodev', dryRun: true }), tempDir);

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

  it('copies harness-specific skills even in link mode', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions({ harness: 'claude', link: true }), tempDir);

    // Verify review-permissions (claude harness-specific) is copied, not symlinked
    const reviewPermissionsPath = path.join(claudeHome, 'skills', 'review-permissions');
    const stats = lstatSync(reviewPermissionsPath);
    expect(stats.isSymbolicLink()).toBe(false);

    // Verify the manifest records it as not linked
    const manifest = await readManifest(getManifestPath(tempDir));
    const claudeManifest = manifest.harnesses.claude;
    expect(claudeManifest).toBeDefined();
    const reviewPermEntry = claudeManifest?.entries.find((e) => e.relativePath === 'skills/review-permissions');
    expect(reviewPermEntry).toBeDefined();
    expect(reviewPermEntry?.linked).toBe(false);
  });

  it('strips surrounding quotes from skill descriptions in prompts.yml', async () => {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });

    // First install to create the initial prompts.yml and manifest
    await installCommand(makeOptions({ harness: 'rovodev' }), tempDir);

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
    await installCommand(makeOptions({ harness: 'rovodev', force: true }), tempDir);

    const promptsPath = path.join(rovodevHome, 'prompts.yml');
    const content = await readFile(promptsPath, 'utf8');

    // Parse as YAML and find the synthetic entries
    const parsed: unknown = parseYaml(content);
    if (typeof parsed !== 'object' || parsed === null || !('prompts' in parsed)) {
      throw new Error('Expected parsed YAML to have a prompts key');
    }
    const doc = parsed;
    if (!Array.isArray(doc.prompts)) {
      throw new TypeError('Expected prompts to be an array');
    }
    const prompts: Array<unknown> = doc.prompts;

    // Find the single-quoted synthetic skill entry
    const singleQuotedEntry = prompts.find((e) => isRecord(e) && e.name === 'synthetic-quoted');
    if (typeof singleQuotedEntry !== 'object' || singleQuotedEntry === null || !('description' in singleQuotedEntry)) {
      throw new Error('Expected synthetic-quoted entry with description');
    }
    // The surrounding quotes should be stripped and the escaped apostrophe should be present
    // (YAML parsing handles the '' -> ' unescaping in the final output)
    expect(singleQuotedEntry.description).toBe("A skill with an apostrophe: it's useful");

    // Find the double-quoted synthetic skill entry
    const doubleQuotedEntry = prompts.find((e) => isRecord(e) && e.name === 'synthetic-double-quoted');
    if (typeof doubleQuotedEntry !== 'object' || doubleQuotedEntry === null || !('description' in doubleQuotedEntry)) {
      throw new Error('Expected synthetic-double-quoted entry with description');
    }
    // The surrounding double quotes should be stripped
    expect(doubleQuotedEntry.description).toBe('A double-quoted description');
  });

  it('rewrites relative Markdown link paths to absolute in copy mode', async () => {
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
    expect(content).not.toMatch(/]\(\.\.\/_data\//);
  });

  it('preserves anchor fragments in rewritten paths', async () => {
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

  it('rewrites paths in skills even in link mode', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

    await installCommand(makeOptions({ link: true }), tempDir);

    // Skills are always copied and rewritten, even in link mode
    const codePatternSkillPath = path.join(claudeHome, 'skills', 'code-patterns');
    const stats = lstatSync(codePatternSkillPath);
    expect(stats.isSymbolicLink()).toBe(false);

    // Verify that the installed copy has rewritten paths
    const installedContent = await readFile(path.join(codePatternSkillPath, 'SKILL.md'), 'utf8');
    expect(installedContent).toContain('~/.claude/skills/_data/naming-conventions.md');

    // Verify that the original source file still has relative paths (not modified)
    const contentDir = resolveContentDir();
    const sourceContent = await readFile(path.join(contentDir, 'skills', 'code-patterns', 'SKILL.md'), 'utf8');
    expect(sourceContent).toContain('../_data/naming-conventions.md');
  });

  describe('provenance markers', () => {
    const YAML_MARKER_LINE_1 = '# GENERATED FILE - Do not edit this file.';
    const HTML_MARKER_LINE_1 = '<!-- GENERATED FILE - Do not edit this file. -->';

    it('injects a YAML-comment marker into skill SKILL.md files', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const skillPath = path.join(claudeHome, 'skills', 'commit', 'SKILL.md');
      const content = await readFile(skillPath, 'utf8');
      const lines = content.split('\n');

      expect(lines[0]).toBe('---');
      expect(lines[1]).toBe(YAML_MARKER_LINE_1);
      expect(lines[2]).toMatch(
        /^# Source: https:\/\/github\.com\/williamthorsen\/codeassembly\/blob\/main\/packages\/agents\/content\/skills\/commit\/SKILL\.md$/,
      );
      expect(lines[3]).toMatch(/^# Edits to this file are overwritten/);
    });

    it('injects markers into nested skill support files', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      // _data files have no frontmatter; marker should be HTML comment
      const dataPath = path.join(claudeHome, 'skills', '_data', 'title-templates.md');
      const content = await readFile(dataPath, 'utf8');

      expect(content.startsWith(HTML_MARKER_LINE_1)).toBe(true);
      expect(content).toContain(
        '<!-- Source: https://github.com/williamthorsen/codeassembly/blob/main/packages/agents/content/skills/_data/title-templates.md -->',
      );
    });

    it('injects a YAML-comment marker into subagent files', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const subagentPath = path.join(claudeHome, 'agents', 'orchestrated-coder.md');
      const content = await readFile(subagentPath, 'utf8');
      const lines = content.split('\n');

      expect(lines[0]).toBe('---');
      expect(lines[1]).toBe(YAML_MARKER_LINE_1);
      expect(lines[2]).toBe(
        '# Source: https://github.com/williamthorsen/codeassembly/blob/main/packages/agents/content/subagents/orchestrated-coder.md',
      );
      // Subagent frontmatter keys (post-merge) still follow the marker
      expect(content).toContain('permissionMode: bypassPermissions');
    });

    it('uses the harness-specific source URL for harness skills', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions({ harness: 'claude' }), tempDir);

      // review-permissions is a claude-specific skill
      const skillPath = path.join(claudeHome, 'skills', 'review-permissions', 'SKILL.md');
      const content = await readFile(skillPath, 'utf8');
      expect(content).toContain(
        '# Source: https://github.com/williamthorsen/codeassembly/blob/main/packages/agents/content/skills/_harnesses/claude/review-permissions/SKILL.md',
      );
    });

    it('injects markers into shared guidance files in copy mode', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions({ link: false }), tempDir);

      const sharedPath = path.join(tempDir, '.agents', 'AGENTS.md');
      const content = await readFile(sharedPath, 'utf8');

      // AGENTS.md has no frontmatter; expect HTML marker at top
      expect(content.startsWith(HTML_MARKER_LINE_1)).toBe(true);
      expect(content).toContain(
        '<!-- Source: https://github.com/williamthorsen/codeassembly/blob/main/packages/agents/content/guidance/shared/AGENTS.md -->',
      );
    });

    it('does NOT inject markers into shared guidance files installed as symlinks', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      // Capture source content before install so we can verify it is unchanged afterward
      const contentDir = resolveContentDir();
      const sourcePath = path.join(contentDir, 'guidance', 'shared', 'AGENTS.md');
      const sourceBefore = await readFile(sourcePath, 'utf8');

      await installCommand(makeOptions({ link: true }), tempDir);

      // The installed entry is a symlink
      const sharedPath = path.join(tempDir, '.agents', 'AGENTS.md');
      const stats = lstatSync(sharedPath);
      expect(stats.isSymbolicLink()).toBe(true);

      // The source file (the symlink's target) must NOT have been mutated: marker-free
      // on input means marker-free on output. Marking the symlink target would corrupt
      // the codeassembly source.
      const sourceAfter = await readFile(sourcePath, 'utf8');
      expect(sourceAfter).toBe(sourceBefore);
      expect(sourceAfter.startsWith(HTML_MARKER_LINE_1)).toBe(false);
    });

    it('is idempotent: re-installing produces byte-identical marker output', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);
      const firstSkill = await readFile(path.join(claudeHome, 'skills', 'commit', 'SKILL.md'), 'utf8');
      const firstData = await readFile(path.join(claudeHome, 'skills', '_data', 'title-templates.md'), 'utf8');
      const firstSubagent = await readFile(path.join(claudeHome, 'agents', 'orchestrated-coder.md'), 'utf8');
      const firstShared = await readFile(path.join(tempDir, '.agents', 'AGENTS.md'), 'utf8');

      await installCommand(makeOptions(), tempDir);
      const secondSkill = await readFile(path.join(claudeHome, 'skills', 'commit', 'SKILL.md'), 'utf8');
      const secondData = await readFile(path.join(claudeHome, 'skills', '_data', 'title-templates.md'), 'utf8');
      const secondSubagent = await readFile(path.join(claudeHome, 'agents', 'orchestrated-coder.md'), 'utf8');
      const secondShared = await readFile(path.join(tempDir, '.agents', 'AGENTS.md'), 'utf8');

      expect(secondSkill).toBe(firstSkill);
      expect(secondData).toBe(firstData);
      expect(secondSubagent).toBe(firstSubagent);
      expect(secondShared).toBe(firstShared);
    });
  });

  describe('installScripts', () => {
    it('places script files in the scripts directory after install', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const scriptsDir = path.join(claudeHome, 'scripts');
      expect(existsSync(scriptsDir)).toBe(true);
      const scriptFiles = await readdir(scriptsDir);
      expect(scriptFiles).toContain('describe-change.sh');
    });

    it('sets executable permissions on copied scripts', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const scriptPath = path.join(claudeHome, 'scripts', 'describe-change.sh');
      const mode = statSync(scriptPath).mode & 0o777;
      expect(mode).toBe(0o755);
    });

    it('records script entries with sha256 hash and linked: false in copy mode', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      const manifest = await readManifest(getManifestPath(tempDir));
      const claudeManifest = manifest.harnesses.claude;
      expect(claudeManifest).toBeDefined();
      const scriptEntries = claudeManifest?.entries.filter((e) => e.relativePath.startsWith('scripts/'));
      expect(scriptEntries?.length).toBeGreaterThan(0);
      for (const entry of scriptEntries ?? []) {
        expect(entry.contentHash).toMatch(/^sha256:/);
        expect(entry.linked).toBe(false);
      }
    });

    it('records script entries with linked: true in link mode', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions({ link: true }), tempDir);

      const manifest = await readManifest(getManifestPath(tempDir));
      const claudeManifest = manifest.harnesses.claude;
      expect(claudeManifest).toBeDefined();
      const scriptEntries = claudeManifest?.entries.filter((e) => e.relativePath.startsWith('scripts/'));
      expect(scriptEntries?.length).toBeGreaterThan(0);
      for (const entry of scriptEntries ?? []) {
        expect(entry.linked).toBe(true);
      }
    });

    it('skips modified script on re-install without --force', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      // Modify a script after installation
      const scriptPath = path.join(claudeHome, 'scripts', 'describe-change.sh');
      const originalContent = await readFile(scriptPath, 'utf8');
      const modifiedContent = originalContent + '\n# user modification\n';
      await writeFile(scriptPath, modifiedContent, 'utf8');

      // Re-install without --force
      await installCommand(makeOptions(), tempDir);

      // Modified script should be preserved
      const afterReinstall = await readFile(scriptPath, 'utf8');
      expect(afterReinstall).toBe(modifiedContent);
    });

    it('overwrites modified script on re-install with --force', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions(), tempDir);

      // Modify a script after installation
      const scriptPath = path.join(claudeHome, 'scripts', 'describe-change.sh');
      const originalContent = await readFile(scriptPath, 'utf8');
      const modifiedContent = originalContent + '\n# user modification\n';
      await writeFile(scriptPath, modifiedContent, 'utf8');

      // Re-install with --force
      await installCommand(makeOptions({ force: true }), tempDir);

      // Modified script should be overwritten
      const afterReinstall = await readFile(scriptPath, 'utf8');
      expect(afterReinstall).not.toBe(modifiedContent);
      expect(afterReinstall).toBe(originalContent);
    });

    it('does not create scripts directory in dry-run mode', async () => {
      const claudeHome = path.join(tempDir, '.claude');
      await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
      await mkdir(path.join(claudeHome, 'agents'), { recursive: true });

      await installCommand(makeOptions({ dryRun: true }), tempDir);

      const scriptsDir = path.join(claudeHome, 'scripts');
      expect(existsSync(scriptsDir)).toBe(false);
    });
  });
});
