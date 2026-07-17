import { existsSync, lstatSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computeContentHash, getManifestPath, readManifest, writeManifest } from '../../lib/manifest.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { buildContentTree } from './build-content-tree.ts';

describe(installCommand, () => {
  let tempDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-install-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(tempDir, 'content');
    await mkdir(tempDir, { recursive: true });
    await buildContentTree(contentDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  async function setupClaudeHome(): Promise<string> {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });
    return claudeHome;
  }

  async function setupRovodevHome(): Promise<string> {
    const rovodevHome = path.join(tempDir, '.rovodev');
    await mkdir(path.join(rovodevHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovodevHome, 'subagents'), { recursive: true });
    return rovodevHome;
  }

  it('installs support directories and guidance with a manifest', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    // Support directory _data is installed.
    expect(existsSync(path.join(claudeHome, 'skills', '_data'))).toBe(true);
    // No skill directory is planted — harness skills and catalog skills deploy via sync, not install.
    expect(existsSync(path.join(claudeHome, 'skills', 'claude-only', 'SKILL.md'))).toBe(false);
    expect(existsSync(path.join(claudeHome, 'skills', 'alpha', 'SKILL.md'))).toBe(false);

    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.claude?.entries.length).toBeGreaterThan(0);
  });

  it('skips a support directory that renders to zero installable entries', async () => {
    const claudeHome = await setupClaudeHome();
    // A support directory whose only content is a dotfile renders to zero entries (the renderer skips dotfiles),
    // so install must skip it rather than create anything.
    const emptySupportSrc = path.join(contentDir, 'skills', 'empty-support');
    await mkdir(emptySupportSrc, { recursive: true });
    await writeFile(path.join(emptySupportSrc, '.DS_Store'), '');

    await expect(installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir)).resolves.toBeUndefined();

    expect(existsSync(path.join(claudeHome, 'skills', 'empty-support'))).toBe(false);
    const manifest = await readManifest(getManifestPath(tempDir));
    const entries = manifest.harnesses.claude?.entries ?? [];
    expect(entries.some((entry) => entry.relativePath === 'skills/empty-support')).toBe(false);
  });

  it('writes nothing in dry-run mode', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ dryRun: true }), tempDir, contentDir);

    expect(existsSync(getManifestPath(tempDir))).toBe(false);
    expect(await readdir(path.join(claudeHome, 'skills'))).toHaveLength(0);
  });

  it('is idempotent: re-installing is byte-identical', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);
    const firstData = await readFile(path.join(claudeHome, 'skills', '_data', 'sample.md'), 'utf8');
    const firstScript = await readFile(path.join(claudeHome, 'scripts', 'demo.sh'), 'utf8');

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);
    const secondData = await readFile(path.join(claudeHome, 'skills', '_data', 'sample.md'), 'utf8');
    const secondScript = await readFile(path.join(claudeHome, 'scripts', 'demo.sh'), 'utf8');

    expect(secondData).toBe(firstData);
    expect(secondScript).toBe(firstScript);
  });

  it('throws when the target skills directory is a symlink', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    const realSkills = path.join(tempDir, 'real-skills');
    await mkdir(realSkills, { recursive: true });
    await mkdir(claudeHome, { recursive: true });
    await symlink(realSkills, path.join(claudeHome, 'skills'));

    await expect(installCommand(makeOptions(), tempDir, contentDir)).rejects.toThrow('Target directory is a symlink');
  });

  it('skips a user-modified shared-guidance file on re-install without --force', async () => {
    await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);
    const guidancePath = path.join(tempDir, '.agents', 'AGENTS.md');
    const modified = (await readFile(guidancePath, 'utf8')) + '\n<!-- user modification -->\n';
    await writeFile(guidancePath, modified, 'utf8');

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    expect(await readFile(guidancePath, 'utf8')).toBe(modified);
  });

  it('overwrites a user-modified shared-guidance file on re-install with --force', async () => {
    await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);
    const guidancePath = path.join(tempDir, '.agents', 'AGENTS.md');
    const managed = await readFile(guidancePath, 'utf8');
    await writeFile(guidancePath, managed + '\n<!-- user modification -->\n', 'utf8');

    await installCommand(makeOptions({ harness: 'claude', force: true }), tempDir, contentDir);

    expect(await readFile(guidancePath, 'utf8')).toBe(managed);
  });

  it('prefixes skip warnings with ⚠️ and the success summary with ✅', async () => {
    await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);
    const guidancePath = path.join(tempDir, '.agents', 'AGENTS.md');
    await writeFile(guidancePath, `${await readFile(guidancePath, 'utf8')}\n<!-- user modification -->\n`, 'utf8');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    let warnLines: ReadonlyArray<string>;
    let infoLines: ReadonlyArray<string>;
    try {
      await installCommand(makeOptions(), tempDir, contentDir);
      warnLines = warnSpy.mock.calls.map((call) => String(call[0]));
      infoLines = infoSpy.mock.calls.map((call) => String(call[0]));
    } finally {
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    }

    expect(warnLines.some((line) => line.includes('⚠️ Skipping modified'))).toBe(true);
    expect(infoLines.some((line) => line.includes('✅ Installed '))).toBe(true);
  });

  it('copies support directories but symlinks scripts in link mode', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ link: true }), tempDir, contentDir);

    // Support directories are always copied (path rewriting forbids symlinking); scripts are symlinked.
    expect(lstatSync(path.join(claudeHome, 'skills', '_data')).isSymbolicLink()).toBe(false);
    expect(lstatSync(path.join(claudeHome, 'scripts', 'demo.sh')).isSymbolicLink()).toBe(true);

    const manifest = await readManifest(getManifestPath(tempDir));
    const entries = manifest.harnesses.claude?.entries ?? [];
    for (const entry of entries.filter((e) => e.relativePath.startsWith('skills/'))) {
      expect(entry.linked).toBe(false);
    }
    for (const entry of entries.filter((e) => e.relativePath.startsWith('scripts/'))) {
      expect(entry.linked).toBe(true);
    }
  });

  it('installs support directories for claude but no harness-specific skill directories', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    const skills = await readdir(path.join(claudeHome, 'skills'));
    expect(skills).toContain('_data');
    expect(skills).not.toContain('claude-only');
    expect(skills).not.toContain('rovodev-only');
  });

  it('installs support directories for rovodev but no harness-specific skill directories', async () => {
    const rovodevHome = await setupRovodevHome();

    await installCommand(makeOptions({ harness: 'rovodev' }), tempDir, contentDir);

    const skills = await readdir(path.join(rovodevHome, 'skills'));
    expect(skills).toContain('_data');
    expect(skills).not.toContain('rovodev-only');
    expect(skills).not.toContain('claude-only');
  });

  it('deploys the _data support tree and scripts but no skill directories or subagents', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    const skills = await readdir(path.join(claudeHome, 'skills'));
    // The _data support tree installs.
    expect(skills).toContain('_data');
    // No skill directory is planted — not harness skills, not general-catalog skills.
    expect(skills).not.toContain('claude-only');
    expect(skills).not.toContain('alpha');
    expect(skills).not.toContain('beta');
    // Subagents do not install unconditionally.
    expect(existsSync(path.join(claudeHome, 'agents', 'demo-agent.md'))).toBe(false);
    // Scripts and shared guidance install as before.
    expect(existsSync(path.join(claudeHome, 'scripts', 'demo.sh'))).toBe(true);
    expect(existsSync(path.join(tempDir, '.agents', 'AGENTS.md'))).toBe(true);
  });

  it('installs the _data support directory but not _harnesses', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    const skills = await readdir(path.join(claudeHome, 'skills'));
    expect(skills).toContain('_data');
    expect(skills).not.toContain('_harnesses');
    expect(await readdir(path.join(claudeHome, 'skills', '_data'))).toContain('sample.md');
  });

  it('uses the harness-specific source URL in markers for installed harness guidance', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    const content = await readFile(path.join(claudeHome, 'CLAUDE.md'), 'utf8');
    expect(content).toContain('content/guidance/_harnesses/claude/CLAUDE.md');
  });

  it('does not inject a marker into symlinked shared guidance', async () => {
    await setupClaudeHome();
    const sourcePath = path.join(contentDir, 'guidance', 'shared', 'AGENTS.md');
    const sourceBefore = await readFile(sourcePath, 'utf8');

    await installCommand(makeOptions({ link: true }), tempDir, contentDir);

    expect(lstatSync(path.join(tempDir, '.agents', 'AGENTS.md')).isSymbolicLink()).toBe(true);
    // Marking the symlink target would corrupt the source: marker-free on input, marker-free on output.
    const sourceAfter = await readFile(sourcePath, 'utf8');
    expect(sourceAfter).toBe(sourceBefore);
    expect(sourceAfter.startsWith('<!-- GENERATED FILE')).toBe(false);
  });

  it('prunes previously-planted harness skills and prompts.yml on re-install', async () => {
    const claudeHome = await setupClaudeHome();
    const rovodevHome = await setupRovodevHome();

    // Seed on-disk files representing what a previous install would have planted.
    const legacySkillDir = path.join(claudeHome, 'skills', 'claude-only');
    await mkdir(legacySkillDir, { recursive: true });
    await writeFile(path.join(legacySkillDir, 'SKILL.md'), '---\nname: claude-only\n---\n', 'utf8');
    const promptsYmlPath = path.join(rovodevHome, 'prompts.yml');
    await writeFile(promptsYmlPath, 'prompts: []\n', 'utf8');
    const promptsYmlHash = await computeContentHash(promptsYmlPath);

    // Seed the manifest to record these as previously installed entries. Directory entries use the sentinel
    // hash; file entries require the actual content hash so the drift check treats them as unmodified.
    await writeManifest(getManifestPath(tempDir), {
      schemaVersion: 2,
      harnesses: {
        claude: {
          harness: 'claude',
          version: '0.1.0',
          installedAt: new Date().toISOString(),
          entries: [
            { relativePath: 'skills/claude-only', contentHash: 'sha256:dir:skills/claude-only', linked: false },
          ],
        },
        rovodev: {
          harness: 'rovodev',
          version: '0.1.0',
          installedAt: new Date().toISOString(),
          entries: [{ relativePath: 'prompts.yml', contentHash: promptsYmlHash, linked: false }],
        },
      },
    });

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);
    await installCommand(makeOptions({ harness: 'rovodev' }), tempDir, contentDir);

    expect(existsSync(path.join(claudeHome, 'skills', 'claude-only'))).toBe(false);
    expect(existsSync(promptsYmlPath)).toBe(false);

    const manifest = await readManifest(getManifestPath(tempDir));
    const claudePaths = manifest.harnesses.claude?.entries.map((e) => e.relativePath) ?? [];
    const rovodevPaths = manifest.harnesses.rovodev?.entries.map((e) => e.relativePath) ?? [];
    expect(claudePaths).not.toContain('skills/claude-only');
    expect(rovodevPaths).not.toContain('prompts.yml');
  });

  describe('scripts', () => {
    it('places scripts and sets the executable bit', async () => {
      const claudeHome = await setupClaudeHome();

      await installCommand(makeOptions(), tempDir, contentDir);

      const scriptPath = path.join(claudeHome, 'scripts', 'demo.sh');
      expect(existsSync(scriptPath)).toBe(true);
      expect(statSync(scriptPath).mode & 0o777).toBe(0o755);
    });

    it('places a bundled .mjs helper alongside the shell scripts', async () => {
      const claudeHome = await setupClaudeHome();
      // The hook relay ships as a bundled `.mjs` rather than a `.sh`: the harness invokes it directly, so it reaches a
      // harness home by the same path as the shell helpers a skill invokes.
      await buildContentTree(contentDir, { scripts: { 'relay-demo.mjs': 'process.stdout.write("{}")\n' } });

      await installCommand(makeOptions(), tempDir, contentDir);

      expect(existsSync(path.join(claudeHome, 'scripts', 'relay-demo.mjs'))).toBe(true);
      expect(existsSync(path.join(claudeHome, 'scripts', 'demo.sh'))).toBe(true);
    });

    it('installs no file that is neither a shell script nor a bundle', async () => {
      const claudeHome = await setupClaudeHome();
      await buildContentTree(contentDir, { scripts: { 'README.md': '# Helper scripts\n' } });

      await installCommand(makeOptions(), tempDir, contentDir);

      expect(existsSync(path.join(claudeHome, 'scripts', 'README.md'))).toBe(false);
    });

    it('records script entries with a sha256 hash and linked:false in copy mode', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions(), tempDir, contentDir);

      const manifest = await readManifest(getManifestPath(tempDir));
      const scripts = manifest.harnesses.claude?.entries.filter((e) => e.relativePath.startsWith('scripts/')) ?? [];
      expect(scripts.length).toBeGreaterThan(0);
      for (const entry of scripts) {
        expect(entry.contentHash).toMatch(/^sha256:/);
        expect(entry.linked).toBe(false);
      }
    });

    it('records script entries with linked:true in link mode', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions({ link: true }), tempDir, contentDir);

      const manifest = await readManifest(getManifestPath(tempDir));
      const scripts = manifest.harnesses.claude?.entries.filter((e) => e.relativePath.startsWith('scripts/')) ?? [];
      expect(scripts.length).toBeGreaterThan(0);
      for (const entry of scripts) {
        expect(entry.linked).toBe(true);
      }
    });

    it('creates no scripts directory in dry-run mode', async () => {
      const claudeHome = await setupClaudeHome();

      await installCommand(makeOptions({ dryRun: true }), tempDir, contentDir);

      expect(existsSync(path.join(claudeHome, 'scripts'))).toBe(false);
    });
  });
});
