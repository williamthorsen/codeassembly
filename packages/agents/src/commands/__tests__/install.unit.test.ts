import { existsSync, lstatSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NoContentSourceError } from '../../lib/declared-sources.ts';
import { HARNESSES } from '../../lib/harness.ts';
import { getHomeProvenancePath } from '../../lib/home-provenance.ts';
import { computeContentHash, getManifestPath, readManifest, writeManifest } from '../../lib/manifest.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { buildContentTree } from '../test-utils/build-content-tree.ts';
import { declareFixtureSource, FIXTURE_SOURCE_NAME } from '../test-utils/declare-fixture-source.ts';

const ROVO_HOME = HARNESSES.rovo.homeDir;

describe(installCommand, () => {
  let tempDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-install-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    contentDir = path.join(tempDir, 'content');
    await mkdir(tempDir, { recursive: true });
    await buildContentTree(contentDir);
    await declareFixtureSource(tempDir, contentDir);
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

  it('refuses a content root declaring an unsupported format, writing nothing', async () => {
    const claudeHome = await setupClaudeHome();
    await writeFile(path.join(contentDir, 'codeassembly-content.yaml'), 'format: 3\n', 'utf8');

    await expect(installCommand(makeOptions({ harness: 'claude' }), tempDir)).rejects.toThrow(
      /Unsupported content format.*3.*supports content formats 1 and 2/s,
    );
    expect(existsSync(path.join(claudeHome, 'scripts', 'demo.sh'))).toBe(false);
    expect(existsSync(getManifestPath(tempDir))).toBe(false);
  });

  it('refuses a dry run exactly as it refuses the real one', async () => {
    await setupClaudeHome();
    await writeFile(path.join(contentDir, 'codeassembly-content.yaml'), 'format: 3\n', 'utf8');

    await expect(installCommand(makeOptions({ harness: 'claude', dryRun: true }), tempDir)).rejects.toThrow(
      /Unsupported content format/,
    );
  });

  it('installs from a content root declaring a supported format', async () => {
    const claudeHome = await setupClaudeHome();
    await writeFile(path.join(contentDir, 'codeassembly-content.yaml'), 'format: 1\n', 'utf8');

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);

    expect(existsSync(path.join(claudeHome, 'scripts', 'demo.sh'))).toBe(true);
  });

  it('installs scripts and guidance with a manifest', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);

    expect(existsSync(path.join(claudeHome, 'scripts', 'demo.sh'))).toBe(true);
    expect(existsSync(path.join(claudeHome, 'CLAUDE.md'))).toBe(true);
    // `install` doesn't plant any skill directory or support entry: Skills and support entries deploy via sync.
    expect(existsSync(path.join(claudeHome, 'skills', 'claude-only', 'SKILL.md'))).toBe(false);
    expect(existsSync(path.join(claudeHome, 'skills', 'alpha', 'SKILL.md'))).toBe(false);
    expect(existsSync(path.join(claudeHome, 'skills', '_data'))).toBe(false);

    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.claude?.entries.map((entry) => entry.relativePath).toSorted()).toEqual([
      'CLAUDE.md',
      'scripts/demo.sh',
    ]);
  });

  it('writes nothing in dry-run mode', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ dryRun: true }), tempDir);

    expect(existsSync(getManifestPath(tempDir))).toBe(false);
    expect(await readdir(path.join(claudeHome, 'skills'))).toHaveLength(0);
  });

  it('is idempotent: Re-installing is byte-identical', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);
    const firstGuidance = await readFile(path.join(claudeHome, 'CLAUDE.md'), 'utf8');
    const firstScript = await readFile(path.join(claudeHome, 'scripts', 'demo.sh'), 'utf8');

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);
    const secondGuidance = await readFile(path.join(claudeHome, 'CLAUDE.md'), 'utf8');
    const secondScript = await readFile(path.join(claudeHome, 'scripts', 'demo.sh'), 'utf8');

    expect(secondGuidance).toBe(firstGuidance);
    expect(secondScript).toBe(firstScript);
  });

  it('throws when the target skills directory is a symlink', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    const realSkills = path.join(tempDir, 'real-skills');
    await mkdir(realSkills, { recursive: true });
    await mkdir(claudeHome, { recursive: true });
    await symlink(realSkills, path.join(claudeHome, 'skills'));

    await expect(installCommand(makeOptions(), tempDir)).rejects.toThrow('Target directory is a symlink');
  });

  it('skips a user-modified guidance file on re-install without --force', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);
    const guidancePath = path.join(claudeHome, 'CLAUDE.md');
    const modified = (await readFile(guidancePath, 'utf8')) + '\n<!-- user modification -->\n';
    await writeFile(guidancePath, modified, 'utf8');

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);

    expect(await readFile(guidancePath, 'utf8')).toBe(modified);
  });

  it('overwrites a user-modified guidance file on re-install with --force', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);
    const guidancePath = path.join(claudeHome, 'CLAUDE.md');
    const managed = await readFile(guidancePath, 'utf8');
    await writeFile(guidancePath, managed + '\n<!-- user modification -->\n', 'utf8');

    await installCommand(makeOptions({ harness: 'claude', force: true }), tempDir);

    expect(await readFile(guidancePath, 'utf8')).toBe(managed);
  });

  it('prefixes skip warnings with the warning glyph and the success summary with the passed glyph', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);
    const guidancePath = path.join(claudeHome, 'CLAUDE.md');
    await writeFile(guidancePath, `${await readFile(guidancePath, 'utf8')}\n<!-- user modification -->\n`, 'utf8');

    using silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions(), tempDir);
    const warnLines = silent.warn.mock.calls.map((call) => String(call[0]));
    const infoLines = silent.info.mock.calls.map((call) => String(call[0]));

    expect(warnLines.some((line) => line.includes('WARN Skipping modified'))).toBe(true);
    expect(infoLines.some((line) => line.includes('PASS Installed '))).toBe(true);
  });

  it('warns when the content does not ship a scripts directory, rather than reporting a clean install', async () => {
    await setupClaudeHome();
    await rm(path.join(contentDir, 'scripts'), { recursive: true, force: true });

    using silent = silenceConsole(['info', 'warn']);
    await installCommand(makeOptions({ harness: 'claude' }), tempDir);
    const warnLines = silent.warn.mock.calls.map((call) => String(call[0]));

    expect(warnLines.some((line) => line.includes("The content roots don't contain a scripts directory"))).toBe(true);
  });

  it('copies guidance but symlinks scripts in link mode', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ link: true }), tempDir);

    // Guidance is always copied (path rewriting forbids symlinking); scripts are symlinked.
    expect(lstatSync(path.join(claudeHome, 'CLAUDE.md')).isSymbolicLink()).toBe(false);
    expect(lstatSync(path.join(claudeHome, 'scripts', 'demo.sh')).isSymbolicLink()).toBe(true);

    const manifest = await readManifest(getManifestPath(tempDir));
    const entries = manifest.harnesses.claude?.entries ?? [];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.linked).toBe(entry.relativePath.startsWith('scripts/'));
    }
  });

  it('installs nothing into the claude skills directory', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);

    expect(await readdir(path.join(claudeHome, 'skills'))).toEqual([]);
  });

  it('installs nothing into the rovo skills directory', async () => {
    const rovoHome = await setupRovoHome();

    await installCommand(makeOptions({ harness: 'rovo' }), tempDir);

    expect(await readdir(path.join(rovoHome, 'skills'))).toEqual([]);
  });

  it('deploys scripts but not skill directories, support entries, or subagents', async () => {
    const claudeHome = await setupClaudeHome();
    await writeFile(path.join(contentDir, 'skills', 'reference.md'), '# Reference\n', 'utf8');

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);

    expect(await readdir(path.join(claudeHome, 'skills'))).toEqual([]);
    expect(existsSync(path.join(claudeHome, 'agents', 'demo-agent.md'))).toBe(false);
    expect(existsSync(path.join(claudeHome, 'scripts', 'demo.sh'))).toBe(true);
  });

  it("resolves an inline support reference in the guidance template to its source's namespace", async () => {
    const claudeHome = await setupClaudeHome();
    await writeFile(
      path.join(contentDir, 'guidance', '_harnesses', 'claude', 'CLAUDE.md'),
      'Read `{harness_home_dir}/skills/_data/sample.md`.\n',
      'utf8',
    );

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);

    expect(await readFile(path.join(claudeHome, 'CLAUDE.md'), 'utf8')).toContain(
      `Read \`~/.claude/skills/_sources/${FIXTURE_SOURCE_NAME}/_data/sample.md\`.`,
    );
  });

  it('names the guidance template by its path in the source in the provenance marker', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);

    const content = await readFile(path.join(claudeHome, 'CLAUDE.md'), 'utf8');
    expect(content).toContain(
      `Source: guidance/_harnesses/claude/CLAUDE.md in source "${FIXTURE_SOURCE_NAME}" (${contentDir})`,
    );
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
    // hash; file entries require the actual content hash so that the drift check treats them as unmodified.
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

    await installCommand(makeOptions({ harness: 'claude' }), tempDir);
    await installCommand(makeOptions({ harness: 'rovo' }), tempDir);

    expect(existsSync(path.join(claudeHome, 'skills', 'claude-only'))).toBe(false);
    expect(existsSync(promptsYmlPath)).toBe(false);

    const manifest = await readManifest(getManifestPath(tempDir));
    const claudePaths = manifest.harnesses.claude?.entries.map((e) => e.relativePath) ?? [];
    const rovoPaths = manifest.harnesses.rovo?.entries.map((e) => e.relativePath) ?? [];
    expect(claudePaths).not.toContain('skills/claude-only');
    expect(rovoPaths).not.toContain('prompts.yml');
  });

  describe('without a usable content source', () => {
    const cases: ReadonlyArray<{ label: string; declare: () => Promise<void> }> = [
      {
        label: 'no declaration',
        declare: () => rm(path.join(tempDir, '.agents', 'codeassembly.yaml')),
      },
      {
        label: 'a declaration without sources',
        declare: () =>
          writeFile(path.join(tempDir, '.agents', 'codeassembly.yaml'), 'harnesses:\n  use:\n    - claude\n', 'utf8'),
      },
      {
        label: 'a declaration whose every source directory is missing',
        declare: () =>
          writeFile(
            path.join(tempDir, '.agents', 'codeassembly.yaml'),
            `sources:\n  - name: gone\n    path: ${path.join(tempDir, 'gone')}\n`,
            'utf8',
          ),
      },
    ];

    for (const { label, declare } of cases) {
      for (const dryRun of [false, true]) {
        it(`stops with NoContentSourceError and writes nothing, given ${label}${dryRun ? ' (dry run)' : ''}`, async () => {
          const claudeHome = await setupClaudeHome();
          await declare();
          using _silent = silenceConsole(['info', 'warn']);

          const run = installCommand(makeOptions({ dryRun }), tempDir);

          await expect(run).rejects.toBeInstanceOf(NoContentSourceError);
          await expect(run).rejects.toThrow(path.join(tempDir, '.agents', 'codeassembly.yaml'));
          await expect(run).rejects.toThrow('codeassembly.local.yaml');
          expect(existsSync(getManifestPath(tempDir))).toBe(false);
          expect(existsSync(path.join(claudeHome, 'CLAUDE.md'))).toBe(false);
          expect(existsSync(path.join(claudeHome, 'scripts'))).toBe(false);
          expect(existsSync(path.join(claudeHome, 'settings.json'))).toBe(false);
          expect(await readdir(path.join(claudeHome, 'skills'))).toEqual([]);
          expect(existsSync(getHomeProvenancePath(tempDir))).toBe(false);
        });
      }
    }
  });

  describe('session-lifecycle hooks', () => {
    it('wires the hook entries into the harness config by default', async () => {
      const claudeHome = await setupClaudeHome();

      await installCommand(makeOptions({ harness: 'claude' }), tempDir);

      const settings = await readFile(path.join(claudeHome, 'settings.json'), 'utf8');
      expect(settings).toContain('--sentinel codeassembly-agents');
      expect(settings).toContain('SessionStart');
    });

    it('leaves the harness config untouched with --skip-hooks', async () => {
      const claudeHome = await setupClaudeHome();

      await installCommand(makeOptions({ harness: 'claude', hooks: false }), tempDir);

      expect(existsSync(path.join(claudeHome, 'settings.json'))).toBe(false);
    });

    it('leaves the harness config untouched in dry-run mode', async () => {
      const claudeHome = await setupClaudeHome();

      await installCommand(makeOptions({ dryRun: true }), tempDir);

      expect(existsSync(path.join(claudeHome, 'settings.json'))).toBe(false);
    });

    it('warns and completes the install when the harness config cannot be parsed', async () => {
      const claudeHome = await setupClaudeHome();
      const settingsPath = path.join(claudeHome, 'settings.json');
      await writeFile(settingsPath, '{ not json', 'utf8');

      using silent = silenceConsole(['warn']);
      await installCommand(makeOptions({ harness: 'claude' }), tempDir);
      const warnLines = silent.warn.mock.calls.map((call) => String(call[0]));

      expect(warnLines.some((line) => line.includes('Skipping hook wiring'))).toBe(true);
      expect(await readFile(settingsPath, 'utf8')).toBe('{ not json');
      const manifest = await readManifest(getManifestPath(tempDir));
      expect(manifest.harnesses.claude?.entries.length).toBeGreaterThan(0);
    });
  });

  describe('scripts', () => {
    it('places scripts and sets the executable bit', async () => {
      const claudeHome = await setupClaudeHome();

      await installCommand(makeOptions(), tempDir);

      const scriptPath = path.join(claudeHome, 'scripts', 'demo.sh');
      expect(existsSync(scriptPath)).toBe(true);
      expect(statSync(scriptPath).mode & 0o777).toBe(0o755);
    });

    it('places a bundled .mjs helper alongside the shell scripts', async () => {
      const claudeHome = await setupClaudeHome();
      // `install` copies a bundled `.mjs` into a harness home by the same path as the shell helpers beside it.
      await buildContentTree(contentDir, { scripts: { 'relay-demo.mjs': 'process.stdout.write("{}")\n' } });

      await installCommand(makeOptions(), tempDir);

      expect(existsSync(path.join(claudeHome, 'scripts', 'relay-demo.mjs'))).toBe(true);
      expect(existsSync(path.join(claudeHome, 'scripts', 'demo.sh'))).toBe(true);
    });

    it('does not install a file that is neither a shell script nor a bundle', async () => {
      const claudeHome = await setupClaudeHome();
      await buildContentTree(contentDir, { scripts: { 'README.md': '# Helper scripts\n' } });

      await installCommand(makeOptions(), tempDir);

      expect(existsSync(path.join(claudeHome, 'scripts', 'README.md'))).toBe(false);
    });

    it('records script entries with a sha256 hash and linked:false in copy mode', async () => {
      await setupClaudeHome();

      await installCommand(makeOptions(), tempDir);

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

      await installCommand(makeOptions({ link: true }), tempDir);

      const manifest = await readManifest(getManifestPath(tempDir));
      const scripts = manifest.harnesses.claude?.entries.filter((e) => e.relativePath.startsWith('scripts/')) ?? [];
      expect(scripts.length).toBeGreaterThan(0);
      for (const entry of scripts) {
        expect(entry.linked).toBe(true);
      }
    });

    it('does not create a scripts directory in dry-run mode', async () => {
      const claudeHome = await setupClaudeHome();

      await installCommand(makeOptions({ dryRun: true }), tempDir);

      expect(existsSync(path.join(claudeHome, 'scripts'))).toBe(false);
    });
  });
});
