import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstallOptions } from '../../lib/types.js';
import { installCommand } from '../install.js';

describe('install with include directives', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-includes-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  /**
   * Builds a minimal synthetic content tree the install pipeline traverses, so tests can
   * inject deliberately-shaped subagents and skills without depending on the real package
   * content. The caller customizes `subagents/` and `skills/` contents.
   */
  async function buildContentTree(
    contentDir: string,
    options: {
      subagents?: Record<string, string>;
      partials?: Record<string, string>;
      skills?: Record<string, Record<string, string>>;
      skillPartials?: Record<string, Record<string, string>>;
    } = {},
  ): Promise<void> {
    await mkdir(path.join(contentDir, 'guidance', 'shared'), { recursive: true });
    await mkdir(path.join(contentDir, 'guidance', '_platforms', 'claude'), { recursive: true });
    await mkdir(path.join(contentDir, 'guidance', '_platforms', 'rovodev'), { recursive: true });
    await mkdir(path.join(contentDir, 'subagents', '_data'), { recursive: true });
    await mkdir(path.join(contentDir, 'skills'), { recursive: true });
    await mkdir(path.join(contentDir, 'scripts'), { recursive: true });

    await writeFile(path.join(contentDir, 'guidance', 'shared', 'AGENTS.md'), '# Shared\n', 'utf8');
    await writeFile(
      path.join(contentDir, 'guidance', '_platforms', 'claude', 'CLAUDE.md'),
      '# Claude guidance\n',
      'utf8',
    );
    await writeFile(path.join(contentDir, 'subagents', '_data', 'claude.yaml'), '_defaults: {}\n', 'utf8');

    for (const [name, body] of Object.entries(options.subagents ?? {})) {
      await writeFile(path.join(contentDir, 'subagents', name), body, 'utf8');
    }

    if (options.partials) {
      const partialsDir = path.join(contentDir, 'subagents', '_partials');
      await mkdir(partialsDir, { recursive: true });
      for (const [name, body] of Object.entries(options.partials)) {
        await writeFile(path.join(partialsDir, name), body, 'utf8');
      }
    }

    for (const [skillName, files] of Object.entries(options.skills ?? {})) {
      const skillDir = path.join(contentDir, 'skills', skillName);
      await mkdir(skillDir, { recursive: true });
      for (const [fileName, body] of Object.entries(files)) {
        const fullPath = path.join(skillDir, fileName);
        await mkdir(path.dirname(fullPath), { recursive: true });
        await writeFile(fullPath, body, 'utf8');
      }
    }

    for (const [skillName, partials] of Object.entries(options.skillPartials ?? {})) {
      const partialsDir = path.join(contentDir, 'skills', skillName, '_partials');
      await mkdir(partialsDir, { recursive: true });
      for (const [name, body] of Object.entries(partials)) {
        await writeFile(path.join(partialsDir, name), body, 'utf8');
      }
    }
  }

  async function setupClaudeHome(): Promise<string> {
    const claudeHome = path.join(tempDir, '.claude');
    await mkdir(path.join(claudeHome, 'skills'), { recursive: true });
    await mkdir(path.join(claudeHome, 'agents'), { recursive: true });
    return claudeHome;
  }

  describe('subagent include expansion', () => {
    it('expands a self-closing partial reference into installed subagent content', async () => {
      const contentDir = path.join(tempDir, 'fake-content');
      await buildContentTree(contentDir, {
        subagents: {
          'demo-agent.md': [
            '---',
            'name: demo-agent',
            'description: Test',
            '---',
            '',
            '# Demo',
            '',
            '<!-- include: _partials/shared.md / -->',
            '',
          ].join('\n'),
        },
        partials: {
          'shared.md': 'Shared content body.\n',
        },
      });

      const claudeHome = await setupClaudeHome();
      await installCommand(makeOptions(), tempDir, contentDir);

      const installed = await readFile(path.join(claudeHome, 'agents', 'demo-agent.md'), 'utf8');
      expect(installed).toContain('Shared content body.');
      expect(installed).not.toContain('<!-- include:');
    });

    it('fills <!-- children --> with caller slot content via open/close pair', async () => {
      const contentDir = path.join(tempDir, 'fake-content');
      await buildContentTree(contentDir, {
        subagents: {
          'demo-agent.md': [
            '---',
            'name: demo-agent',
            'description: Test',
            '---',
            '',
            '<!-- include: _partials/with-slot.md -->',
            'Caller-provided slot line.',
            '<!-- /include -->',
            '',
          ].join('\n'),
        },
        partials: {
          'with-slot.md': ['Header.', '<!-- children -->', 'Footer.', ''].join('\n'),
        },
      });

      const claudeHome = await setupClaudeHome();
      await installCommand(makeOptions(), tempDir, contentDir);

      const installed = await readFile(path.join(claudeHome, 'agents', 'demo-agent.md'), 'utf8');
      expect(installed).toContain('Header.');
      expect(installed).toContain('Caller-provided slot line.');
      expect(installed).toContain('Footer.');
    });

    it('throws DirectiveExpansionError before writing when a partial is missing', async () => {
      const contentDir = path.join(tempDir, 'fake-content');
      await buildContentTree(contentDir, {
        subagents: {
          'demo-agent.md': [
            '---',
            'name: demo-agent',
            'description: Test',
            '---',
            '',
            '<!-- include: _partials/nonexistent.md / -->',
            '',
          ].join('\n'),
        },
      });

      const claudeHome = await setupClaudeHome();
      await expect(installCommand(makeOptions(), tempDir, contentDir)).rejects.toMatchObject({
        name: 'DirectiveExpansionError',
        reason: 'not-found',
      });

      // No subagent file should be written when include resolution fails.
      expect(existsSync(path.join(claudeHome, 'agents', 'demo-agent.md'))).toBe(false);
    });

    it('surfaces include errors in dry-run mode', async () => {
      const contentDir = path.join(tempDir, 'fake-content');
      await buildContentTree(contentDir, {
        subagents: {
          'demo-agent.md': [
            '---',
            'name: demo-agent',
            'description: Test',
            '---',
            '',
            '<!-- include: _partials/missing.md / -->',
            '',
          ].join('\n'),
        },
      });

      const claudeHome = await setupClaudeHome();
      await expect(installCommand(makeOptions({ dryRun: true }), tempDir, contentDir)).rejects.toMatchObject({
        name: 'DirectiveExpansionError',
        reason: 'not-found',
      });
      expect(existsSync(path.join(claudeHome, 'agents', 'demo-agent.md'))).toBe(false);
    });
  });

  describe('subagent _partials exclusion', () => {
    it('does not install the _partials directory or its contents', async () => {
      const contentDir = path.join(tempDir, 'fake-content');
      await buildContentTree(contentDir, {
        subagents: {
          'demo-agent.md': [
            '---',
            'name: demo-agent',
            'description: Test',
            '---',
            '',
            '<!-- include: _partials/shared.md / -->',
            '',
          ].join('\n'),
        },
        partials: {
          'shared.md': 'Body.\n',
        },
      });

      const claudeHome = await setupClaudeHome();
      await installCommand(makeOptions(), tempDir, contentDir);

      // The partial source is not installed as a top-level subagent file.
      expect(existsSync(path.join(claudeHome, 'agents', '_partials'))).toBe(false);
      expect(existsSync(path.join(claudeHome, 'agents', '_partials', 'shared.md'))).toBe(false);
    });
  });

  describe('skill include expansion', () => {
    it('expands a partial referenced from SKILL.md', async () => {
      const contentDir = path.join(tempDir, 'fake-content');
      await buildContentTree(contentDir, {
        skills: {
          'demo-skill': {
            'SKILL.md': [
              '---',
              'name: demo-skill',
              'description: Demo',
              '---',
              '',
              '# Demo skill',
              '',
              '<!-- include: _partials/shared.md / -->',
              '',
            ].join('\n'),
          },
        },
        skillPartials: {
          'demo-skill': {
            'shared.md': 'Skill partial body.\n',
          },
        },
      });

      const claudeHome = await setupClaudeHome();
      await installCommand(makeOptions(), tempDir, contentDir);

      const installed = await readFile(path.join(claudeHome, 'skills', 'demo-skill', 'SKILL.md'), 'utf8');
      expect(installed).toContain('Skill partial body.');
      expect(installed).not.toContain('<!-- include:');
    });

    it('expands a partial referenced from a modules/*.md file inside a skill directory', async () => {
      const contentDir = path.join(tempDir, 'fake-content');
      await buildContentTree(contentDir, {
        skills: {
          'demo-skill': {
            'SKILL.md': ['---', 'name: demo-skill', 'description: Demo', '---', '', '# Demo', ''].join('\n'),
            'modules/sub.md': ['# Submodule', '', '<!-- include: ../_partials/shared.md / -->', ''].join('\n'),
          },
        },
        skillPartials: {
          'demo-skill': {
            'shared.md': 'Module partial body.\n',
          },
        },
      });

      const claudeHome = await setupClaudeHome();
      await installCommand(makeOptions(), tempDir, contentDir);

      const installed = await readFile(path.join(claudeHome, 'skills', 'demo-skill', 'modules', 'sub.md'), 'utf8');
      expect(installed).toContain('Module partial body.');
      expect(installed).not.toContain('<!-- include:');
    });

    it('throws DirectiveExpansionError when a skill references a missing partial', async () => {
      const contentDir = path.join(tempDir, 'fake-content');
      await buildContentTree(contentDir, {
        skills: {
          'demo-skill': {
            'SKILL.md': [
              '---',
              'name: demo-skill',
              'description: Demo',
              '---',
              '',
              '<!-- include: _partials/missing.md / -->',
              '',
            ].join('\n'),
          },
        },
      });

      await setupClaudeHome();
      await expect(installCommand(makeOptions(), tempDir, contentDir)).rejects.toMatchObject({
        name: 'DirectiveExpansionError',
        reason: 'not-found',
      });
    });
  });

  describe('skill _partials exclusion', () => {
    it("does not install a skill's _partials/ directory", async () => {
      const contentDir = path.join(tempDir, 'fake-content');
      await buildContentTree(contentDir, {
        skills: {
          'demo-skill': {
            'SKILL.md': [
              '---',
              'name: demo-skill',
              'description: Demo',
              '---',
              '',
              '<!-- include: _partials/shared.md / -->',
              '',
            ].join('\n'),
          },
        },
        skillPartials: {
          'demo-skill': {
            'shared.md': 'body\n',
          },
        },
      });

      const claudeHome = await setupClaudeHome();
      await installCommand(makeOptions(), tempDir, contentDir);

      expect(existsSync(path.join(claudeHome, 'skills', 'demo-skill', '_partials'))).toBe(false);
      expect(existsSync(path.join(claudeHome, 'skills', 'demo-skill', '_partials', 'shared.md'))).toBe(false);
    });

    it('skips _partials nested at any depth inside a skill', async () => {
      const contentDir = path.join(tempDir, 'fake-content');
      await buildContentTree(contentDir, {
        skills: {
          'demo-skill': {
            'SKILL.md': ['---', 'name: demo-skill', 'description: Demo', '---', '', '# Demo', ''].join('\n'),
            'modules/sub.md': '# Sub\n',
            'modules/_partials/inner.md': 'inner partial\n',
          },
        },
      });

      const claudeHome = await setupClaudeHome();
      await installCommand(makeOptions(), tempDir, contentDir);

      expect(existsSync(path.join(claudeHome, 'skills', 'demo-skill', 'modules', 'sub.md'))).toBe(true);
      expect(existsSync(path.join(claudeHome, 'skills', 'demo-skill', 'modules', '_partials'))).toBe(false);
    });

    it('rewrites markdown links inside expanded skill content (expand-then-rewrite ordering)', async () => {
      const contentDir = path.join(tempDir, 'fake-content');
      await buildContentTree(contentDir, {
        skills: {
          'demo-skill': {
            'SKILL.md': [
              '---',
              'name: demo-skill',
              'description: Demo',
              '---',
              '',
              '<!-- include: _partials/with-link.md / -->',
              '',
            ].join('\n'),
          },
        },
        skillPartials: {
          'demo-skill': {
            'with-link.md': 'See [the conventions](_data/case-conventions.md).\n',
          },
        },
      });

      const claudeHome = await setupClaudeHome();
      await installCommand(makeOptions(), tempDir, contentDir);

      const installed = await readFile(path.join(claudeHome, 'skills', 'demo-skill', 'SKILL.md'), 'utf8');
      // The bare-relative link should have been rewritten to an absolute platform path.
      expect(installed).not.toMatch(/\]\(_data\/case-conventions\.md\)/);
      expect(installed).toMatch(/case-conventions\.md/);
    });
  });
});
