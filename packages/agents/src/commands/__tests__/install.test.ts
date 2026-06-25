import { existsSync, lstatSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { getManifestPath, readManifest } from '../../lib/manifest.ts';
import { isRecord } from '../../lib/type-guards.ts';
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

  it('installs skills, subagents, and a manifest', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions(), tempDir, contentDir);

    expect(existsSync(path.join(claudeHome, 'skills', 'alpha', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(claudeHome, 'agents', 'demo-agent.md'))).toBe(true);

    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.claude?.entries.length).toBeGreaterThan(0);
  });

  it('writes nothing in dry-run mode', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ dryRun: true }), tempDir, contentDir);

    expect(existsSync(getManifestPath(tempDir))).toBe(false);
    expect(await readdir(path.join(claudeHome, 'skills'))).toHaveLength(0);
  });

  it('is idempotent: re-installing is byte-identical', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions(), tempDir, contentDir);
    const firstSkill = await readFile(path.join(claudeHome, 'skills', 'alpha', 'SKILL.md'), 'utf8');
    const firstAgent = await readFile(path.join(claudeHome, 'agents', 'demo-agent.md'), 'utf8');

    await installCommand(makeOptions(), tempDir, contentDir);
    const secondSkill = await readFile(path.join(claudeHome, 'skills', 'alpha', 'SKILL.md'), 'utf8');
    const secondAgent = await readFile(path.join(claudeHome, 'agents', 'demo-agent.md'), 'utf8');

    expect(secondSkill).toBe(firstSkill);
    expect(secondAgent).toBe(firstAgent);
  });

  it('merges the harness overlay into subagent frontmatter', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions(), tempDir, contentDir);

    // The overlay applies `_defaults` (permissionMode) and the per-agent override (model, memory) to demo-agent.
    const content = await readFile(path.join(claudeHome, 'agents', 'demo-agent.md'), 'utf8');
    expect(content).toContain('permissionMode: bypassPermissions');
    expect(content).toContain('model: inherit');
    expect(content).toContain('memory: user');
  });

  it('expands {harness_home_dir} tokens in subagent bodies', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions(), tempDir, contentDir);

    const content = await readFile(path.join(claudeHome, 'agents', 'demo-agent.md'), 'utf8');
    expect(content).toContain('~/.claude/scripts/demo.sh');
    expect(content).not.toContain('{harness_home_dir}');
  });

  it('throws when the target skills directory is a symlink', async () => {
    const claudeHome = path.join(tempDir, '.claude');
    const realSkills = path.join(tempDir, 'real-skills');
    await mkdir(realSkills, { recursive: true });
    await mkdir(claudeHome, { recursive: true });
    await symlink(realSkills, path.join(claudeHome, 'skills'));

    await expect(installCommand(makeOptions(), tempDir, contentDir)).rejects.toThrow('Target directory is a symlink');
  });

  it('skips a user-modified subagent on re-install without --force', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions(), tempDir, contentDir);
    const agentPath = path.join(claudeHome, 'agents', 'demo-agent.md');
    const modified = (await readFile(agentPath, 'utf8')) + '\n<!-- user modification -->\n';
    await writeFile(agentPath, modified, 'utf8');

    await installCommand(makeOptions(), tempDir, contentDir);

    expect(await readFile(agentPath, 'utf8')).toBe(modified);
  });

  it('overwrites a user-modified subagent on re-install with --force', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions(), tempDir, contentDir);
    const agentPath = path.join(claudeHome, 'agents', 'demo-agent.md');
    const managed = await readFile(agentPath, 'utf8');
    await writeFile(agentPath, managed + '\n<!-- user modification -->\n', 'utf8');

    await installCommand(makeOptions({ force: true }), tempDir, contentDir);

    expect(await readFile(agentPath, 'utf8')).toBe(managed);
  });

  it('prefixes skip warnings with ⚠️ and the success summary with ✅', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions(), tempDir, contentDir);
    const agentPath = path.join(claudeHome, 'agents', 'demo-agent.md');
    await writeFile(agentPath, `${await readFile(agentPath, 'utf8')}\n<!-- user modification -->\n`, 'utf8');

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

  it('copies skills and subagents but symlinks scripts in link mode', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ link: true }), tempDir, contentDir);

    // Skills (path rewriting) and subagents (frontmatter merge) are always copied; scripts are symlinked.
    expect(lstatSync(path.join(claudeHome, 'skills', 'alpha')).isSymbolicLink()).toBe(false);
    expect(lstatSync(path.join(claudeHome, 'skills', 'claude-only')).isSymbolicLink()).toBe(false);
    expect(lstatSync(path.join(claudeHome, 'agents', 'demo-agent.md')).isSymbolicLink()).toBe(false);
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

  it('installs claude harness skills and excludes rovodev harness skills', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    const skills = await readdir(path.join(claudeHome, 'skills'));
    expect(skills).toContain('claude-only');
    expect(skills).not.toContain('rovodev-only');
  });

  it('installs rovodev harness skills and excludes claude harness skills', async () => {
    const rovodevHome = await setupRovodevHome();

    await installCommand(makeOptions({ harness: 'rovodev' }), tempDir, contentDir);

    const skills = await readdir(path.join(rovodevHome, 'skills'));
    expect(skills).toContain('rovodev-only');
    expect(skills).not.toContain('claude-only');
  });

  it('excludes a skill marked deploy: declared from install and the manifest', async () => {
    const claudeHome = await setupClaudeHome();
    await buildContentTree(contentDir, {
      skills: {
        'declared-skill': {
          'SKILL.md': [
            '---',
            'name: declared-skill',
            'description: Declared fixture skill',
            'deploy: declared',
            '---',
            '',
            '# Declared',
            '',
          ].join('\n'),
        },
      },
    });

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    const skills = await readdir(path.join(claudeHome, 'skills'));
    expect(skills).not.toContain('declared-skill');
    // A skill without the field installs unchanged.
    expect(skills).toContain('alpha');

    const manifest = await readManifest(getManifestPath(tempDir));
    const relativePaths = manifest.harnesses.claude?.entries.map((entry) => entry.relativePath) ?? [];
    expect(relativePaths).not.toContain('skills/declared-skill');
    expect(relativePaths).toContain('skills/alpha');
  });

  it('excludes a subagent marked deploy: declared from install and the manifest', async () => {
    const claudeHome = await setupClaudeHome();
    await buildContentTree(contentDir, {
      subagents: {
        'declared-agent.md': [
          '---',
          'name: declared-agent',
          'description: Declared fixture subagent',
          'deploy: declared',
          '---',
          '',
          '# Declared agent',
          '',
        ].join('\n'),
      },
    });

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    const subagents = await readdir(path.join(claudeHome, 'agents'));
    expect(subagents).not.toContain('declared-agent.md');
    // A subagent without the field installs unchanged.
    expect(subagents).toContain('demo-agent.md');

    const manifest = await readManifest(getManifestPath(tempDir));
    const relativePaths = manifest.harnesses.claude?.entries.map((entry) => entry.relativePath) ?? [];
    expect(relativePaths).not.toContain('agents/declared-agent.md');
    expect(relativePaths).toContain('agents/demo-agent.md');
  });

  it('prunes a previously-installed subagent once it flips to deploy: declared', async () => {
    const claudeHome = await setupClaudeHome();
    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);
    expect(existsSync(path.join(claudeHome, 'agents', 'demo-agent.md'))).toBe(true);

    await buildContentTree(contentDir, {
      subagents: {
        'demo-agent.md': [
          '---',
          'name: demo-agent',
          'description: Demo fixture subagent',
          'deploy: declared',
          '---',
          '',
          '# Demo agent',
          '',
        ].join('\n'),
      },
    });

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    expect(existsSync(path.join(claudeHome, 'agents', 'demo-agent.md'))).toBe(false);
    const manifest = await readManifest(getManifestPath(tempDir));
    const relativePaths = manifest.harnesses.claude?.entries.map((entry) => entry.relativePath) ?? [];
    expect(relativePaths).not.toContain('agents/demo-agent.md');
  });

  it('installs the _data support directory but not _harnesses', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    const skills = await readdir(path.join(claudeHome, 'skills'));
    expect(skills).toContain('_data');
    expect(skills).not.toContain('_harnesses');
    expect(await readdir(path.join(claudeHome, 'skills', '_data'))).toContain('sample.md');
  });

  it('uses the harness-specific source URL in markers for harness skills', async () => {
    const claudeHome = await setupClaudeHome();

    await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

    const content = await readFile(path.join(claudeHome, 'skills', 'claude-only', 'SKILL.md'), 'utf8');
    expect(content).toContain('content/skills/_harnesses/claude/claude-only/SKILL.md');
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

  describe('prompts.yml (rovodev)', () => {
    function extractPrompts(content: string): Array<Record<string, unknown>> {
      const parsed: unknown = parseYaml(content);
      if (!isRecord(parsed) || !Array.isArray(parsed.prompts)) {
        throw new Error('Expected parsed YAML with a prompts array');
      }
      return parsed.prompts.filter((entry): entry is Record<string, unknown> => isRecord(entry));
    }

    it('generates a valid prompts.yml filtered by user-invocable', async () => {
      const rovodevHome = await setupRovodevHome();

      await installCommand(makeOptions({ harness: 'rovodev' }), tempDir, contentDir);

      const prompts = extractPrompts(await readFile(path.join(rovodevHome, 'prompts.yml'), 'utf8'));
      for (const entry of prompts) {
        expect(typeof entry.name).toBe('string');
        expect(typeof entry.description).toBe('string');
        expect(typeof entry.content_file).toBe('string');
      }
      const names = prompts.map((entry) => entry.name);
      expect(names).toContain('alpha'); // user-invocable: true
      expect(names).toContain('rovodev-only'); // user-invocable defaults to true
      expect(names).not.toContain('beta'); // user-invocable: false
    });

    it('strips surrounding quotes from skill descriptions', async () => {
      const rovodevHome = await setupRovodevHome();
      await buildContentTree(contentDir, {
        skills: {
          'single-quoted': {
            'SKILL.md': [
              '---',
              'name: single-quoted',
              "description: 'A skill: it''s useful'",
              'user-invocable: true',
              '---',
              '',
              '# Single quoted',
              '',
            ].join('\n'),
          },
          'double-quoted': {
            'SKILL.md': [
              '---',
              'name: double-quoted',
              'description: "A double-quoted description"',
              'user-invocable: true',
              '---',
              '',
              '# Double quoted',
              '',
            ].join('\n'),
          },
        },
      });

      await installCommand(makeOptions({ harness: 'rovodev' }), tempDir, contentDir);

      const prompts = extractPrompts(await readFile(path.join(rovodevHome, 'prompts.yml'), 'utf8'));
      const single = prompts.find((entry) => entry.name === 'single-quoted');
      const double = prompts.find((entry) => entry.name === 'double-quoted');
      expect(single?.description).toBe("A skill: it's useful");
      expect(double?.description).toBe('A double-quoted description');
    });

    it('tracks prompts.yml in the manifest', async () => {
      await setupRovodevHome();

      await installCommand(makeOptions({ harness: 'rovodev' }), tempDir, contentDir);

      const manifest = await readManifest(getManifestPath(tempDir));
      const entry = manifest.harnesses.rovodev?.entries.find((e) => e.relativePath === 'prompts.yml');
      expect(entry?.linked).toBe(false);
      expect(entry?.contentHash).toMatch(/^sha256:/);
    });

    it('does not generate prompts.yml for claude', async () => {
      const claudeHome = await setupClaudeHome();

      await installCommand(makeOptions({ harness: 'claude' }), tempDir, contentDir);

      expect(existsSync(path.join(claudeHome, 'prompts.yml'))).toBe(false);
    });

    it('tolerates stray non-skill entries in the destination skills directory', async () => {
      const rovodevHome = await setupRovodevHome();
      // A `.DS_Store` (dotfile) and a plain file both reach generatePromptsYml's readdir; joining SKILL.md onto a
      // non-directory raises ENOTDIR/ENOENT, which is swallowed.
      await writeFile(path.join(rovodevHome, 'skills', '.DS_Store'), '', 'utf8');
      await writeFile(path.join(rovodevHome, 'skills', 'stray-file'), '', 'utf8');

      await expect(installCommand(makeOptions({ harness: 'rovodev' }), tempDir, contentDir)).resolves.toBeUndefined();

      const prompts = extractPrompts(await readFile(path.join(rovodevHome, 'prompts.yml'), 'utf8'));
      const names = prompts.map((entry) => entry.name);
      expect(names).not.toContain('.DS_Store');
      expect(names).not.toContain('stray-file');
    });

    it('writes no prompts.yml or manifest in dry-run mode', async () => {
      const rovodevHome = await setupRovodevHome();

      await installCommand(makeOptions({ harness: 'rovodev', dryRun: true }), tempDir, contentDir);

      expect(existsSync(path.join(rovodevHome, 'prompts.yml'))).toBe(false);
      expect(existsSync(getManifestPath(tempDir))).toBe(false);
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
