import { existsSync, lstatSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HARNESSES } from '../../lib/harness.ts';
import { computeContentHash, getManifestPath, readManifest, writeManifest } from '../../lib/manifest.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { buildContentTree } from '../test-utils/build-content-tree.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

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

  async function setupRovoHome(): Promise<string> {
    const rovoHome = path.join(tempDir, ROVO_HOME);
    await mkdir(path.join(rovoHome, 'skills'), { recursive: true });
    await mkdir(path.join(rovoHome, 'subagents'), { recursive: true });
    return rovoHome;
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

  it('skips a user-modified guidance file on re-install without --force', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);
    const guidancePath = path.join(claudeHome, 'CLAUDE.md');
    const modified = (await readFile(guidancePath, 'utf8')) + '\n<!-- user modification -->\n';
    await writeFile(guidancePath, modified, 'utf8');

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    expect(await readFile(guidancePath, 'utf8')).toBe(modified);
  });

  it('overwrites a user-modified guidance file on re-install with --force', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);
    const guidancePath = path.join(claudeHome, 'CLAUDE.md');
    const managed = await readFile(guidancePath, 'utf8');
    await writeFile(guidancePath, managed + '\n<!-- user modification -->\n', 'utf8');

    await installCommand(makeOptions({ harness: 'claude', force: true }), tempDir, contentDir);

    expect(await readFile(guidancePath, 'utf8')).toBe(managed);
  });

  it('prefixes skip warnings with ⚠️ and the success summary with ✅', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);
    const guidancePath = path.join(claudeHome, 'CLAUDE.md');
    await writeFile(guidancePath, `${await readFile(guidancePath, 'utf8')}\n<!-- user modification -->\n`, 'utf8');

    using silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions(), tempDir, contentDir);
    const warnLines = silent.warn.mock.calls.map((call) => String(call[0]));
    const infoLines = silent.info.mock.calls.map((call) => String(call[0]));

    expect(warnLines.some((line) => line.includes('⚠️ Skipping modified'))).toBe(true);
    expect(infoLines.some((line) => line.includes('✅ Installed '))).toBe(true);
  });

  it('warns when the content ships no skills directory, rather than reporting a clean install', async () => {
    await setupClaudeHome();
    await rm(path.join(contentDir, 'skills'), { recursive: true, force: true });

    using silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);
    const warnLines = silent.warn.mock.calls.map((call) => String(call[0]));

    expect(warnLines.some((line) => line.includes('no skills directory found'))).toBe(true);
  });

  it('copies support directories but symlinks scripts in link mode', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ link: true }), tempDir, contentDir);

    // Support directories are always copied (path rewriting forbids symlinking); scripts are symlinked.
    expect(lstatSync(path.join(claudeHome, 'skills', '_data')).isSymbolicLink()).toBe(false);
    expect(lstatSync(path.join(claudeHome, 'scripts', 'demo.sh')).isSymbolicLink()).toBe(true);

    const manifest = await readManifest(getManifestPath(tempDir));
    const entries = manifest.harnesses.claude?.entries ?? [];
    for (const entry of entries) {
      if (entry.relativePath.startsWith('skills/')) expect(entry.linked).toBe(false);
      if (entry.relativePath.startsWith('scripts/')) expect(entry.linked).toBe(true);
    }
  });

  it('installs support directories for claude but no harness-specific skill directories', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    const skills = await readdir(path.join(claudeHome, 'skills'));
    expect(skills).toContain('_data');
    expect(skills).not.toContain('claude-only');
    expect(skills).not.toContain('rovo-only');
  });

  it('installs support directories for rovo but no harness-specific skill directories', async () => {
    const rovoHome = await setupRovoHome();

    await installCommand(makeOptions({ harness: 'rovo' }), tempDir, contentDir);

    const skills = await readdir(path.join(rovoHome, 'skills'));
    expect(skills).toContain('_data');
    expect(skills).not.toContain('rovo-only');
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
    // Scripts install as before.
    expect(existsSync(path.join(claudeHome, 'scripts', 'demo.sh'))).toBe(true);
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

  it('prunes previously-planted harness skills and prompts.yml on re-install', async () => {
    const claudeHome = await setupClaudeHome();
    const rovoHome = await setupRovoHome();

    // Seed on-disk files representing what a previous install would have planted.
    const legacySkillDir = path.join(claudeHome, 'skills', 'claude-only');
    await mkdir(legacySkillDir, { recursive: true });
    await writeFile(path.join(legacySkillDir, 'SKILL.md'), '---\nname: claude-only\n---\n', 'utf8');
    const promptsYmlPath = path.join(rovoHome, 'prompts.yml');
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
        rovo: {
          harness: 'rovo',
          version: '0.1.0',
          installedAt: new Date().toISOString(),
          entries: [{ relativePath: 'prompts.yml', contentHash: promptsYmlHash, linked: false }],
        },
      },
    });

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);
    await installCommand(makeOptions({ harness: 'rovo' }), tempDir, contentDir);

    expect(existsSync(path.join(claudeHome, 'skills', 'claude-only'))).toBe(false);
    expect(existsSync(promptsYmlPath)).toBe(false);

    const manifest = await readManifest(getManifestPath(tempDir));
    const claudePaths = manifest.harnesses.claude?.entries.map((e) => e.relativePath) ?? [];
    const rovoPaths = manifest.harnesses.rovo?.entries.map((e) => e.relativePath) ?? [];
    expect(claudePaths).not.toContain('skills/claude-only');
    expect(rovoPaths).not.toContain('prompts.yml');
  });

  describe('session-lifecycle hooks', () => {
    it('wires the hook entries into the harness config by default', async () => {
      const claudeHome = await setupClaudeHome();

      await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

      const settings = await readFile(path.join(claudeHome, 'settings.json'), 'utf8');
      expect(settings).toContain('--sentinel codeassembly-agents');
      expect(settings).toContain('SessionStart');
    });

    it('leaves the harness config untouched with --skip-hooks', async () => {
      const claudeHome = await setupClaudeHome();

      await installCommand(makeOptions({ harness: 'claude', hooks: false }), tempDir, contentDir);

      expect(existsSync(path.join(claudeHome, 'settings.json'))).toBe(false);
    });

    it('leaves the harness config untouched in dry-run mode', async () => {
      const claudeHome = await setupClaudeHome();

      await installCommand(makeOptions({ dryRun: true }), tempDir, contentDir);

      expect(existsSync(path.join(claudeHome, 'settings.json'))).toBe(false);
    });

    it('warns and completes the install when the harness config cannot be parsed', async () => {
      const claudeHome = await setupClaudeHome();
      const settingsPath = path.join(claudeHome, 'settings.json');
      await writeFile(settingsPath, '{ not json', 'utf8');

      using silent = silenceConsole(['warn']);
      await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);
      const warnLines = silent.warn.mock.calls.map((call) => String(call[0]));

      expect(warnLines.some((line) => line.includes('Skipping hook wiring'))).toBe(true);
      // The broken config is left alone, and the rest of the install still lands and is tracked.
      expect(await readFile(settingsPath, 'utf8')).toBe('{ not json');
      const manifest = await readManifest(getManifestPath(tempDir));
      expect(manifest.harnesses.claude?.entries.length).toBeGreaterThan(0);
    });
  });

  describe('a flat .md directly under content/skills/', () => {
    /** Writes a top-level `.md` beside the skill directories, the shape whose `SKILL.md` probe yields ENOTDIR. */
    async function writeFlatSkill(body: string): Promise<string> {
      const filePath = path.join(contentDir, 'skills', 'flat-note.md');
      await writeFile(filePath, body, 'utf8');
      return filePath;
    }

    it('installs it rather than aborting the run on the skill-directory probe', async () => {
      const claudeHome = await setupClaudeHome();
      await writeFlatSkill('# Flat note\n\nSee [the note](#flat-note).\n');

      await installCommand(makeOptions(), tempDir, contentDir);

      expect(existsSync(path.join(claudeHome, 'skills', 'flat-note.md'))).toBe(true);
    });

    it('rewrites its links, invocation tokens, and template variables on the way to the harness home', async () => {
      const claudeHome = await setupClaudeHome();
      await writeFlatSkill(
        '# Flat note\n\nSee [the table](_data/table.md), run {skill:commit}, then `{harness_home_dir}/scripts/x.sh`.\n',
      );

      await installCommand(makeOptions(), tempDir, contentDir);

      const installed = await readFile(path.join(claudeHome, 'skills', 'flat-note.md'), 'utf8');
      expect(installed).toContain('[the table](~/.claude/skills/_data/table.md)');
      expect(installed).toContain('run /commit,');
      expect(installed).toContain('`~/.claude/scripts/x.sh`');
    });

    it('fails the run when its anchor names no heading', async () => {
      await setupClaudeHome();
      await writeFlatSkill('# Flat note\n\nSee [the events](#lifecycle-events).\n');

      await expect(installCommand(makeOptions(), tempDir, contentDir)).rejects.toThrow(
        /skills\/flat-note\.md carries 1 unresolvable anchor link target/,
      );
    });
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
      // A bundled `.mjs` reaches a harness home by the same path as the shell helpers beside it.
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
