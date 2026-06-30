import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

import { unindent } from '@williamthorsen/toolbelt.strings/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveContentDir } from '../../lib/content-resolver.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { syncCommand, syncGlobalCommand } from '../sync.ts';

describe(syncCommand, () => {
  let projectRoot: string;
  let contentDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    projectRoot = path.join(tmpdir(), `agents-test-sync-proj-${stamp}`);
    contentDir = path.join(tmpdir(), `agents-test-sync-content-${stamp}`);
    await mkdir(projectRoot, { recursive: true });
    await mkdir(path.join(contentDir, 'guidance', 'rulebooks'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(contentDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  /** Writes a fixture rulebook into the temp content library. */
  async function writeLibraryRulebook(slug: string, frontmatter: string, body: string): Promise<void> {
    const file = path.join(contentDir, 'guidance', 'rulebooks', `${slug}.md`);
    await writeFile(file, `---\nslug: ${slug}\n${frontmatter}\n---\n\n${body}\n`, 'utf8');
  }

  /** Writes the project-scope codeassembly.yaml declaring the given rulebook slugs in the grouped format. */
  async function declareRulebooks(...slugs: ReadonlyArray<string>): Promise<void> {
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    const useBlock =
      slugs.length === 0 ? '  use: []\n' : `  use:\n${slugs.map((slug) => `    - ${slug}`).join('\n')}\n`;
    await writeFile(path.join(projectRoot, '.agents', 'codeassembly.yaml'), `rulebooks:\n${useBlock}`, 'utf8');
  }

  /** Writes the project-local codeassembly.local.yaml verbatim, for multi-tier and drop cases. */
  async function writeLocalDeclaration(content: string): Promise<void> {
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await writeFile(path.join(projectRoot, '.agents', 'codeassembly.local.yaml'), content, 'utf8');
  }

  function neutralPath(slug: string): string {
    return path.join(projectRoot, '.agents', 'rulebooks', `${slug}.md`);
  }

  const projectMdPath = (): string => path.join(projectRoot, '.agents', 'PROJECT.md');

  const skillPath = (slug: string, dotDir = '.claude'): string =>
    path.join(projectRoot, dotDir, 'skills', slug, 'SKILL.md');

  it('when no codeassembly.yaml exists, makes no changes', async () => {
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(path.join(projectRoot, '.agents', 'rulebooks'))).toBe(false);
    expect(existsSync(projectMdPath())).toBe(false);
  });

  it('writes the neutral body with frontmatter stripped for a declared rulebook', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', '# Alpha\n\nAlpha rules.');
    await declareRulebooks('alpha');

    await syncCommand(makeOptions(), projectRoot, contentDir);

    const neutral = await readFile(neutralPath('alpha'), 'utf8');
    expect(neutral).toBe('# Alpha\n\nAlpha rules.\n');
    expect(neutral).not.toContain('slug:');
  });

  it('inlines an ambient rulebook into PROJECT.md between sentinels, creating the file', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', '# Alpha\n\nAlpha rules.');
    await declareRulebooks('alpha');

    await syncCommand(makeOptions(), projectRoot, contentDir);

    const projectMd = await readFile(projectMdPath(), 'utf8');
    expect(projectMd).toContain('<!-- rulebook:alpha -->');
    expect(projectMd).toContain('<!-- /rulebook:alpha -->');
    expect(projectMd).toContain('Alpha rules.');
  });

  it('preserves hand-authored PROJECT.md content when inlining', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await writeFile(projectMdPath(), '# Project\n\nHand-authored intro.\n', 'utf8');

    await syncCommand(makeOptions(), projectRoot, contentDir);

    const projectMd = await readFile(projectMdPath(), 'utf8');
    expect(projectMd).toContain('Hand-authored intro.');
    expect(projectMd).toContain('<!-- rulebook:alpha -->');
  });

  it('when re-run with the same manifest, produces no file changes', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', '# Alpha\n\nAlpha rules.');
    await declareRulebooks('alpha');

    await syncCommand(makeOptions(), projectRoot, contentDir);
    const firstProjectMd = await readFile(projectMdPath(), 'utf8');
    const firstNeutral = await readFile(neutralPath('alpha'), 'utf8');

    await syncCommand(makeOptions(), projectRoot, contentDir);
    const secondProjectMd = await readFile(projectMdPath(), 'utf8');
    const secondNeutral = await readFile(neutralPath('alpha'), 'utf8');

    expect(secondProjectMd).toBe(firstProjectMd);
    expect(secondNeutral).toBe(firstNeutral);
  });

  it('retracts a rulebook that is no longer declared', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await writeLibraryRulebook('beta', 'delivery: ambient', 'Beta rules.');
    await declareRulebooks('alpha', 'beta');
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(neutralPath('beta'))).toBe(true);

    await declareRulebooks('alpha');
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(neutralPath('beta'))).toBe(false);
    expect(existsSync(neutralPath('alpha'))).toBe(true);
    const projectMd = await readFile(projectMdPath(), 'utf8');
    expect(projectMd).not.toContain('<!-- rulebook:beta -->');
    expect(projectMd).toContain('<!-- rulebook:alpha -->');
  });

  it('retracts the inlined block when a rulebook delivery changes away from ambient', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    await syncCommand(makeOptions(), projectRoot, contentDir);
    expect(await readFile(projectMdPath(), 'utf8')).toContain('<!-- rulebook:alpha -->');

    await writeLibraryRulebook('alpha', 'delivery: skill', 'Alpha rules.');
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(neutralPath('alpha'))).toBe(true);
    const projectMd = await readFile(projectMdPath(), 'utf8');
    expect(projectMd).not.toContain('<!-- rulebook:alpha -->');
  });

  it('when the manifest is emptied, retracts every block and neutral file', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRulebooks('alpha');
    await syncCommand(makeOptions(), projectRoot, contentDir);
    expect(existsSync(neutralPath('alpha'))).toBe(true);

    await declareRulebooks();
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(neutralPath('alpha'))).toBe(false);
    expect(await readFile(projectMdPath(), 'utf8')).not.toContain('<!-- rulebook:alpha -->');
  });

  it('throws when a declared rulebook has no library file', async () => {
    await declareRulebooks('ghost');

    await expect(syncCommand(makeOptions(), projectRoot, contentDir)).rejects.toThrow(/ghost/);
  });

  it('writes a skill file for a skill-only rulebook without inlining it into PROJECT.md', async () => {
    await writeLibraryRulebook('gamma', 'delivery: skill\ndescription: Gamma desc.', 'Gamma rules.');
    await declareRulebooks('gamma');

    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(neutralPath('gamma'))).toBe(true);
    expect(existsSync(projectMdPath())).toBe(false);
    const skill = await readFile(skillPath('consult-gamma'), 'utf8');
    expect(skill).toContain('name: consult-gamma');
    expect(skill).toContain('description: Gamma desc.');
    expect(skill).toContain('<!-- codeassembly-rulebook:gamma -->');
    expect(skill).toContain('Gamma rules.');
  });

  it('renders a skill-name override as the skill directory and name, keeping the marker on the slug', async () => {
    await writeLibraryRulebook('gamma', 'delivery: skill\nskill-name: gamma-rulebook', 'Gamma rules.');
    await declareRulebooks('gamma');

    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(skillPath('consult-gamma'))).toBe(false);
    const skill = await readFile(skillPath('gamma-rulebook'), 'utf8');
    expect(skill).toContain('name: gamma-rulebook');
    expect(skill).toContain('<!-- codeassembly-rulebook:gamma -->');
  });

  it('writes a skill file for a multi-modal rulebook and also inlines it into PROJECT.md', async () => {
    await writeLibraryRulebook('delta', 'delivery: [ambient, skill]', 'Delta rules.');
    await declareRulebooks('delta');

    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(await readFile(projectMdPath(), 'utf8')).toContain('<!-- rulebook:delta -->');
    expect(await readFile(skillPath('consult-delta'), 'utf8')).toContain('Delta rules.');
  });

  it('when re-run with unchanged content, does not rewrite the skill file', async () => {
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');
    await syncCommand(makeOptions(), projectRoot, contentDir);
    const firstMtime = statSync(skillPath('consult-gamma')).mtimeMs;

    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(statSync(skillPath('consult-gamma')).mtimeMs).toBe(firstMtime);
  });

  it('retracts the skill directory when a skill rulebook is no longer declared', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('alpha', 'gamma');
    await syncCommand(makeOptions(), projectRoot, contentDir);
    expect(existsSync(skillPath('consult-gamma'))).toBe(true);

    await declareRulebooks('alpha');
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(path.dirname(skillPath('consult-gamma')))).toBe(false);
  });

  it('retracts the skill directory when a rulebook delivery changes away from skill', async () => {
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');
    await syncCommand(makeOptions(), projectRoot, contentDir);
    expect(existsSync(skillPath('consult-gamma'))).toBe(true);

    await writeLibraryRulebook('gamma', 'delivery: ambient', 'Gamma rules.');
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(path.dirname(skillPath('consult-gamma')))).toBe(false);
    expect(existsSync(neutralPath('gamma'))).toBe(true);
  });

  it('retracts the prior skill directory when a rulebook resolved skill name changes', async () => {
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');
    await syncCommand(makeOptions(), projectRoot, contentDir);
    expect(existsSync(skillPath('consult-gamma'))).toBe(true);

    await writeLibraryRulebook('gamma', 'delivery: skill\nskill-name: gamma-rulebook', 'Gamma rules.');
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(path.dirname(skillPath('consult-gamma')))).toBe(false);
    expect(existsSync(skillPath('gamma-rulebook'))).toBe(true);
  });

  it('migrates a legacy slug-named skill directory to the consult- name', async () => {
    const legacy = skillPath('gamma');
    await mkdir(path.dirname(legacy), { recursive: true });
    await writeFile(
      legacy,
      '---\nname: gamma\nuser-invocable: true\n---\n<!-- codeassembly-rulebook:gamma -->\n\nGamma rules.\n',
      'utf8',
    );
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');

    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(path.dirname(skillPath('gamma')))).toBe(false);
    expect(existsSync(skillPath('consult-gamma'))).toBe(true);
  });

  it('with --harness claude, writes only the Claude skills dir', async () => {
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');

    await syncCommand(makeOptions({ harness: 'claude' }), projectRoot, contentDir);

    expect(existsSync(skillPath('consult-gamma', '.claude'))).toBe(true);
    expect(existsSync(skillPath('consult-gamma', '.rovodev'))).toBe(false);
  });

  it('with no detected harness, writes no skill files but still writes the neutral file', async () => {
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');

    await syncCommand(makeOptions({ harness: 'all' }), projectRoot, contentDir);

    expect(existsSync(neutralPath('gamma'))).toBe(true);
    expect(existsSync(skillPath('consult-gamma'))).toBe(false);
  });

  it('never deletes a hand-authored skill that lacks the sync marker', async () => {
    const manualSkill = skillPath('manual');
    await mkdir(path.dirname(manualSkill), { recursive: true });
    await writeFile(manualSkill, '---\nname: manual\n---\n\n# Hand-authored\n', 'utf8');
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('gamma');

    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(manualSkill)).toBe(true);
    expect(existsSync(skillPath('consult-gamma'))).toBe(true);
  });

  it('in dry-run mode, writes nothing to disk', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await declareRulebooks('alpha', 'gamma');

    await syncCommand(makeOptions({ dryRun: true }), projectRoot, contentDir);

    expect(existsSync(neutralPath('alpha'))).toBe(false);
    expect(existsSync(projectMdPath())).toBe(false);
    expect(existsSync(skillPath('consult-gamma'))).toBe(false);
  });

  it('deploys and retracts the real shell-conventions canary end-to-end', async () => {
    await declareRulebooks('shell-conventions');
    await syncCommand(makeOptions(), projectRoot, resolveContentDir());

    const neutral = await readFile(neutralPath('shell-conventions'), 'utf8');
    expect(neutral).toContain('# Shell script conventions');
    expect(neutral).not.toContain('slug:');
    const skill = await readFile(skillPath('consult-shell-conventions'), 'utf8');
    expect(skill).toContain('name: consult-shell-conventions');
    expect(skill).toContain('# Shell script conventions');

    await declareRulebooks();
    await syncCommand(makeOptions(), projectRoot, resolveContentDir());

    expect(existsSync(neutralPath('shell-conventions'))).toBe(false);
    expect(existsSync(path.dirname(skillPath('consult-shell-conventions')))).toBe(false);
  });

  it('deploys a rulebook declared only in the project-local tier, and retracts it on drop', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await writeLibraryRulebook('beta', 'delivery: ambient', 'Beta rules.');
    await declareRulebooks('alpha');
    await writeLocalDeclaration('rulebooks:\n  use:\n    - beta\n');
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(neutralPath('alpha'))).toBe(true);
    expect(existsSync(neutralPath('beta'))).toBe(true);

    await writeLocalDeclaration('rulebooks:\n  use:\n    - beta\n  drop:\n    - alpha\n');
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(neutralPath('alpha'))).toBe(false);
    expect(existsSync(neutralPath('beta'))).toBe(true);
  });

  it('fails when two skill rulebooks resolve to the same skill name, naming both slugs', async () => {
    await writeLibraryRulebook('gamma', 'delivery: skill\nskill-name: shared', 'Gamma rules.');
    await writeLibraryRulebook('delta', 'delivery: skill\nskill-name: shared', 'Delta rules.');
    await declareRulebooks('gamma', 'delta');

    let message = '';
    try {
      await syncCommand(makeOptions(), projectRoot, contentDir);
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('shared');
    expect(message).toContain('gamma');
    expect(message).toContain('delta');
    expect(existsSync(skillPath('shared'))).toBe(false);
  });

  it('reassigns a skill name from one rulebook to another within a single sync', async () => {
    await writeLibraryRulebook('foo', 'delivery: skill\nskill-name: shared', 'Foo rules.');
    await declareRulebooks('foo');
    await syncCommand(makeOptions(), projectRoot, contentDir);
    expect(existsSync(skillPath('shared'))).toBe(true);

    await writeLibraryRulebook('foo', 'delivery: skill', 'Foo rules.');
    await writeLibraryRulebook('bar', 'delivery: skill\nskill-name: shared', 'Bar rules.');
    await declareRulebooks('foo', 'bar');
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(await readFile(skillPath('consult-foo'), 'utf8')).toContain('<!-- codeassembly-rulebook:foo -->');
    const shared = await readFile(skillPath('shared'), 'utf8');
    expect(shared).toContain('name: shared');
    expect(shared).toContain('<!-- codeassembly-rulebook:bar -->');
  });

  describe('declared skills', () => {
    /** Writes a fixture skill into the temp content library's `skills/<slug>/SKILL.md`. */
    async function writeLibrarySkill(
      slug: string,
      { body = `# ${slug}\n\nBody.` }: { body?: string } = {},
    ): Promise<void> {
      const dir = path.join(contentDir, 'skills', slug);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\n---\n\n${body}\n`, 'utf8');
    }

    /** Writes the project-scope codeassembly.yaml declaring the given skill slugs. */
    async function declareSkills(...slugs: ReadonlyArray<string>): Promise<void> {
      await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
      const useBlock =
        slugs.length === 0 ? '  use: []\n' : `  use:\n${slugs.map((slug) => `    - ${slug}`).join('\n')}\n`;
      await writeFile(path.join(projectRoot, '.agents', 'codeassembly.yaml'), `skills:\n${useBlock}`, 'utf8');
    }

    /** Writes the project-scope codeassembly.yaml verbatim, for declarations mixing types. */
    async function declareRaw(content: string): Promise<void> {
      await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
      await writeFile(path.join(projectRoot, '.agents', 'codeassembly.yaml'), content, 'utf8');
    }

    it('deploys a declared skill into the project-local skills dir with the ownership marker', async () => {
      await writeLibrarySkill('people-report');
      await declareSkills('people-report');

      await syncCommand(makeOptions(), projectRoot, contentDir);

      const skill = await readFile(skillPath('people-report'), 'utf8');
      expect(skill).toContain('<!-- codeassembly-skill:people-report -->');
      expect(skill).toContain('# people-report');
    });

    it('when re-run with unchanged content, does not rewrite the declared skill file', async () => {
      await writeLibrarySkill('people-report');
      await declareSkills('people-report');
      await syncCommand(makeOptions(), projectRoot, contentDir);
      const firstMtime = statSync(skillPath('people-report')).mtimeMs;

      await syncCommand(makeOptions(), projectRoot, contentDir);

      expect(statSync(skillPath('people-report')).mtimeMs).toBe(firstMtime);
    });

    it('retracts a declared skill directory once it is no longer declared', async () => {
      await writeLibrarySkill('people-report');
      await writeLibrarySkill('other');
      await declareSkills('people-report', 'other');
      await syncCommand(makeOptions(), projectRoot, contentDir);
      expect(existsSync(skillPath('other'))).toBe(true);

      await declareSkills('people-report');
      await syncCommand(makeOptions(), projectRoot, contentDir);

      expect(existsSync(path.dirname(skillPath('other')))).toBe(false);
      expect(existsSync(skillPath('people-report'))).toBe(true);
    });

    it('never deletes a hand-authored skill when retracting declared skills', async () => {
      const manual = skillPath('manual');
      await mkdir(path.dirname(manual), { recursive: true });
      await writeFile(manual, '---\nname: manual\n---\n\n# Hand-authored\n', 'utf8');
      await writeLibrarySkill('people-report');
      await declareSkills('people-report');
      await syncCommand(makeOptions(), projectRoot, contentDir);

      await declareSkills();
      await syncCommand(makeOptions(), projectRoot, contentDir);

      expect(existsSync(manual)).toBe(true);
      expect(existsSync(path.dirname(skillPath('people-report')))).toBe(false);
    });

    it('throws when a declared skill is missing from the library, writing nothing', async () => {
      await declareSkills('ghost');

      await expect(syncCommand(makeOptions(), projectRoot, contentDir)).rejects.toThrow(/ghost/);
      expect(existsSync(skillPath('ghost'))).toBe(false);
    });

    it('deploys declared skills and rulebook skills side by side without clobbering each other', async () => {
      await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
      await writeLibrarySkill('people-report');
      await declareRaw('rulebooks:\n  use:\n    - gamma\nskills:\n  use:\n    - people-report\n');
      await syncCommand(makeOptions(), projectRoot, contentDir);
      expect(await readFile(skillPath('consult-gamma'), 'utf8')).toContain('<!-- codeassembly-rulebook:gamma -->');
      expect(await readFile(skillPath('people-report'), 'utf8')).toContain('<!-- codeassembly-skill:people-report -->');

      await syncCommand(makeOptions(), projectRoot, contentDir);

      expect(existsSync(skillPath('consult-gamma'))).toBe(true);
      expect(existsSync(skillPath('people-report'))).toBe(true);
    });

    it('errors when a declared skill and a rulebook skill would share a directory name', async () => {
      await writeLibraryRulebook('foo', 'delivery: skill\nskill-name: shared', 'Foo rules.');
      await writeLibrarySkill('shared');
      await declareRaw('rulebooks:\n  use:\n    - foo\nskills:\n  use:\n    - shared\n');

      await expect(syncCommand(makeOptions(), projectRoot, contentDir)).rejects.toThrow(/collision/i);
      expect(existsSync(skillPath('shared'))).toBe(false);
    });

    it('previews declared-skill writes and retractions in dry-run without writing', async () => {
      await writeLibrarySkill('people-report');
      await declareSkills('people-report');

      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      let output: string;
      try {
        await syncCommand(makeOptions({ dryRun: true }), projectRoot, contentDir);
        output = infoSpy.mock.calls.map((call) => String(call[0])).join('\n');
      } finally {
        infoSpy.mockRestore();
      }

      expect(output).toContain('people-report');
      expect(existsSync(skillPath('people-report'))).toBe(false);
    });

    it('deploys and retracts the real people-report canary end-to-end', async () => {
      await declareSkills('people-report');
      await syncCommand(makeOptions(), projectRoot, resolveContentDir());

      const skill = await readFile(skillPath('people-report'), 'utf8');
      expect(skill).toContain('<!-- codeassembly-skill:people-report -->');
      expect(skill).toContain('# People report');

      await declareSkills();
      await syncCommand(makeOptions(), projectRoot, resolveContentDir());

      expect(existsSync(path.dirname(skillPath('people-report')))).toBe(false);
    });

    it('applies include expansion and tool-name and link rewriting when deploying a declared skill', async () => {
      await mkdir(path.join(contentDir, 'subagents', '_data'), { recursive: true });
      await writeFile(
        path.join(contentDir, 'subagents', '_data', 'claude.yaml'),
        '_tools:\n  Read: open_files\n',
        'utf8',
      );
      const skillDir = path.join(contentDir, 'skills', 'demo');
      await mkdir(path.join(skillDir, '_partials'), { recursive: true });
      await writeFile(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: demo\n---\n\n<!-- include: _partials/frag.md / -->\n\nUse {tool:Read}. See [guide](./guide.md).\n',
        'utf8',
      );
      await writeFile(path.join(skillDir, '_partials', 'frag.md'), 'Shared fragment.\n', 'utf8');
      await writeFile(path.join(skillDir, 'guide.md'), '# Guide\n', 'utf8');
      await declareSkills('demo');

      await syncCommand(makeOptions(), projectRoot, contentDir);

      const skill = await readFile(skillPath('demo'), 'utf8');
      expect(skill).toContain('Shared fragment.');
      expect(skill).toContain('Use open_files.');
      expect(skill).toContain('[guide](~/.claude/skills/demo/guide.md)');
      expect(skill).not.toContain('{tool:Read}');
      expect(existsSync(path.join(projectRoot, '.claude', 'skills', 'demo', '_partials'))).toBe(false);
    });

    it('fails before writing when a declared skill has an unmapped tool placeholder, dry-run included', async () => {
      await writeLibrarySkill('demo', { body: 'Use {tool:Read}.' });
      await declareSkills('demo');

      await expect(syncCommand(makeOptions({ dryRun: true }), projectRoot, contentDir)).rejects.toThrow(
        /Unmapped tool name "Read" in skills\/demo\/SKILL\.md/,
      );
      await expect(syncCommand(makeOptions(), projectRoot, contentDir)).rejects.toThrow(/Unmapped tool name "Read"/);
      expect(existsSync(skillPath('demo'))).toBe(false);
    });
  });

  describe('harness-targeted skills', () => {
    /** Writes a fixture skill `<slug>/SKILL.md`, with an optional `harnesses:` line and body override. */
    async function writeLibrarySkill(
      slug: string,
      { harnesses, body }: { harnesses?: string; body?: string } = {},
    ): Promise<void> {
      const dir = path.join(contentDir, 'skills', slug);
      await mkdir(dir, { recursive: true });
      const harnessLine = harnesses === undefined ? '' : `harnesses: ${harnesses}\n`;
      const content = body ?? `# ${slug}\n\nBody.`;
      await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\n${harnessLine}---\n\n${content}\n`, 'utf8');
    }

    /** Writes the project-scope codeassembly.yaml declaring the given skill slugs. */
    async function declareSkills(...slugs: ReadonlyArray<string>): Promise<void> {
      await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
      const useBlock =
        slugs.length === 0 ? '  use: []\n' : `  use:\n${slugs.map((slug) => `    - ${slug}`).join('\n')}\n`;
      await writeFile(path.join(projectRoot, '.agents', 'codeassembly.yaml'), `skills:\n${useBlock}`, 'utf8');
    }

    /** Creates both harness home dirs so `harness: 'all'` detects claude and rovodev. */
    async function detectBothHarnesses(): Promise<void> {
      await mkdir(path.join(projectRoot, '.claude'), { recursive: true });
      await mkdir(path.join(projectRoot, '.rovodev'), { recursive: true });
    }

    it('deploys a harness-targeted skill only into its target harness, while all-harness skills reach both', async () => {
      await detectBothHarnesses();
      await writeLibrarySkill('rovo-only', { harnesses: '[rovodev]' });
      await writeLibrarySkill('everywhere');
      await declareSkills('rovo-only', 'everywhere');

      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, contentDir);

      expect(existsSync(skillPath('rovo-only', '.rovodev'))).toBe(true);
      expect(existsSync(skillPath('rovo-only', '.claude'))).toBe(false);
      expect(existsSync(skillPath('everywhere', '.claude'))).toBe(true);
      expect(existsSync(skillPath('everywhere', '.rovodev'))).toBe(true);
    });

    it('does not render a harness-targeted skill against a non-target harness whose tool map would reject it', async () => {
      await detectBothHarnesses();
      // rovodev maps Read; claude does not, so rendering this skill against claude would throw on the unmapped tool.
      const overlays = path.join(contentDir, 'subagents', '_data');
      await mkdir(overlays, { recursive: true });
      await writeFile(path.join(overlays, 'rovodev.yaml'), '_tools:\n  Read: open_files\n', 'utf8');
      await writeFile(path.join(overlays, 'claude.yaml'), '_tools:\n  Edit: Edit\n', 'utf8');
      await writeLibrarySkill('rovo-tool', { harnesses: '[rovodev]', body: 'Use {tool:Read}.' });
      await declareSkills('rovo-tool');

      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, contentDir);

      expect(await readFile(skillPath('rovo-tool', '.rovodev'), 'utf8')).toContain('Use open_files.');
      expect(existsSync(skillPath('rovo-tool', '.claude'))).toBe(false);
    });

    it('retracts a skill from a harness it no longer targets while keeping it where it still does', async () => {
      await detectBothHarnesses();
      await writeLibrarySkill('was-everywhere');
      await declareSkills('was-everywhere');
      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, contentDir);
      expect(existsSync(skillPath('was-everywhere', '.claude'))).toBe(true);
      expect(existsSync(skillPath('was-everywhere', '.rovodev'))).toBe(true);

      await writeLibrarySkill('was-everywhere', { harnesses: '[rovodev]' });
      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, contentDir);

      expect(existsSync(path.dirname(skillPath('was-everywhere', '.claude')))).toBe(false);
      expect(existsSync(skillPath('was-everywhere', '.rovodev'))).toBe(true);
    });
  });

  describe('declared subagents', () => {
    const CLAUDE_OVERLAY = unindent`
      _tools:
        Read: Read

      _defaults:
        permissionMode: bypassPermissions

    `;
    const ROVODEV_OVERLAY = unindent`
      _tools:
        Read: open_files

      _defaults:
        tools: [open_files]

    `;

    const subagentPath = (slug: string, dotDir = '.claude', subDir = 'agents'): string =>
      path.join(projectRoot, dotDir, subDir, `${slug}.md`);

    /** Writes the harness overlays so the subagent transform has tool mappings and `_defaults`. */
    async function writeOverlays(): Promise<void> {
      const dataDir = path.join(contentDir, 'subagents', '_data');
      await mkdir(dataDir, { recursive: true });
      await writeFile(path.join(dataDir, 'claude.yaml'), CLAUDE_OVERLAY, 'utf8');
      await writeFile(path.join(dataDir, 'rovodev.yaml'), ROVODEV_OVERLAY, 'utf8');
    }

    /** Writes a fixture subagent `<slug>.md` into the temp content library's `subagents/`. */
    async function writeLibrarySubagent(slug: string): Promise<void> {
      const dir = path.join(contentDir, 'subagents');
      await mkdir(dir, { recursive: true });
      const content = `# ${slug}\n\nUse {tool:Read}; run \`{harness_home_dir}/scripts/x.sh\`.`;
      await writeFile(path.join(dir, `${slug}.md`), `---\nname: ${slug}\n---\n\n${content}\n`, 'utf8');
    }

    /** Writes the project-scope codeassembly.yaml declaring the given subagent slugs. */
    async function declareSubagents(...slugs: ReadonlyArray<string>): Promise<void> {
      await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
      const useBlock =
        slugs.length === 0 ? '  use: []\n' : `  use:\n${slugs.map((slug) => `    - ${slug}`).join('\n')}\n`;
      await writeFile(path.join(projectRoot, '.agents', 'codeassembly.yaml'), `subagents:\n${useBlock}`, 'utf8');
    }

    it('deploys a declared subagent with the transform applied and the ownership marker, no provenance marker', async () => {
      await writeOverlays();
      await writeLibrarySubagent('canary');
      await declareSubagents('canary');

      await syncCommand(makeOptions(), projectRoot, contentDir);

      const deployed = await readFile(subagentPath('canary'), 'utf8');
      expect(deployed).toContain('<!-- codeassembly-subagent:canary -->');
      expect(deployed).toContain('permissionMode: bypassPermissions');
      expect(deployed).toContain('Use Read;');
      expect(deployed).toContain('~/.claude/scripts/x.sh');
      expect(deployed).not.toContain('GENERATED FILE');
    });

    it('when re-run with unchanged content, leaves the declared subagent file byte-identical and unwritten', async () => {
      await writeOverlays();
      await writeLibrarySubagent('canary');
      await declareSubagents('canary');
      await syncCommand(makeOptions(), projectRoot, contentDir);
      const firstBytes = await readFile(subagentPath('canary'), 'utf8');
      const firstMtime = statSync(subagentPath('canary')).mtimeMs;

      await syncCommand(makeOptions(), projectRoot, contentDir);

      expect(await readFile(subagentPath('canary'), 'utf8')).toBe(firstBytes);
      expect(statSync(subagentPath('canary')).mtimeMs).toBe(firstMtime);
    });

    it('retracts a declared subagent file once it is no longer declared', async () => {
      await writeOverlays();
      await writeLibrarySubagent('canary');
      await writeLibrarySubagent('other');
      await declareSubagents('canary', 'other');
      await syncCommand(makeOptions(), projectRoot, contentDir);
      expect(existsSync(subagentPath('other'))).toBe(true);

      await declareSubagents('canary');
      await syncCommand(makeOptions(), projectRoot, contentDir);

      expect(existsSync(subagentPath('other'))).toBe(false);
      expect(existsSync(subagentPath('canary'))).toBe(true);
    });

    it('never deletes a hand-authored subagent file that lacks the marker', async () => {
      await writeOverlays();
      const manual = subagentPath('manual');
      await mkdir(path.dirname(manual), { recursive: true });
      await writeFile(manual, '---\nname: manual\n---\n\n# Hand-authored\n', 'utf8');
      await writeLibrarySubagent('canary');
      await declareSubagents('canary');
      await syncCommand(makeOptions(), projectRoot, contentDir);

      await declareSubagents();
      await syncCommand(makeOptions(), projectRoot, contentDir);

      expect(existsSync(manual)).toBe(true);
      expect(existsSync(subagentPath('canary'))).toBe(false);
    });

    it('throws when a declared subagent is missing from the library, writing nothing', async () => {
      await writeOverlays();
      await declareSubagents('ghost');

      await expect(syncCommand(makeOptions(), projectRoot, contentDir)).rejects.toThrow(/ghost/);
      expect(existsSync(subagentPath('ghost'))).toBe(false);
    });

    it('deploys the same subagent into each targeted harness with its own transform', async () => {
      await mkdir(path.join(projectRoot, '.claude', 'agents'), { recursive: true });
      await mkdir(path.join(projectRoot, '.rovodev', 'subagents'), { recursive: true });
      await writeOverlays();
      await writeLibrarySubagent('canary');
      await declareSubagents('canary');

      await syncCommand(makeOptions({ harness: 'all' }), projectRoot, contentDir);

      const claude = await readFile(subagentPath('canary', '.claude', 'agents'), 'utf8');
      const rovodev = await readFile(subagentPath('canary', '.rovodev', 'subagents'), 'utf8');
      expect(claude).toContain('Use Read;');
      expect(claude).toContain('~/.claude/scripts/x.sh');
      expect(rovodev).toContain('Use open_files;');
      expect(rovodev).toContain('~/.rovodev/scripts/x.sh');
    });

    it('previews declared-subagent writes and retractions in dry-run without writing', async () => {
      await writeOverlays();
      await writeLibrarySubagent('canary');
      await declareSubagents('canary');

      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      let output: string;
      try {
        await syncCommand(makeOptions({ dryRun: true }), projectRoot, contentDir);
        output = infoSpy.mock.calls.map((call) => String(call[0])).join('\n');
      } finally {
        infoSpy.mockRestore();
      }

      expect(output).toContain('canary');
      expect(existsSync(subagentPath('canary'))).toBe(false);
    });

    it('deploys and retracts the real canary subagent end-to-end', async () => {
      await declareSubagents('canary');
      await syncCommand(makeOptions(), projectRoot, resolveContentDir());

      const deployed = await readFile(subagentPath('canary'), 'utf8');
      expect(deployed).toContain('<!-- codeassembly-subagent:canary -->');
      expect(deployed).toContain('# Canary');
      expect(deployed).not.toContain('{tool:Read}');
      expect(deployed).not.toContain('{harness_home_dir}');
      expect(deployed).toContain('~/.claude');

      await declareSubagents();
      await syncCommand(makeOptions(), projectRoot, resolveContentDir());

      expect(existsSync(subagentPath('canary'))).toBe(false);
    });
  });

  describe('project Rovo Dev prompts.yml', () => {
    /** Writes a fixture skill into the temp content library, with optional extra frontmatter line(s). */
    async function writeLibrarySkill(slug: string, frontmatter = ''): Promise<void> {
      const dir = path.join(contentDir, 'skills', slug);
      await mkdir(dir, { recursive: true });
      const extra = frontmatter === '' ? '' : `${frontmatter}\n`;
      await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\n${extra}---\n\n# ${slug}\n\nBody.\n`, 'utf8');
    }

    /** Writes the project-scope codeassembly.yaml declaring the given skill slugs. */
    async function declareSkills(...slugs: ReadonlyArray<string>): Promise<void> {
      await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
      const useBlock =
        slugs.length === 0 ? '  use: []\n' : `  use:\n${slugs.map((slug) => `    - ${slug}`).join('\n')}\n`;
      await writeFile(path.join(projectRoot, '.agents', 'codeassembly.yaml'), `skills:\n${useBlock}`, 'utf8');
    }

    const promptsYmlPath = (): string => path.join(projectRoot, '.rovodev', 'prompts.yml');

    /** Seeds a hand-authored `prompts.yml` carrying a single foreign entry and no codeassembly region. */
    async function seedHandAuthoredPromptsYml(): Promise<void> {
      await mkdir(path.join(projectRoot, '.rovodev'), { recursive: true });
      await writeFile(
        promptsYmlPath(),
        "prompts:\n  - name: 'hand-authored'\n    description: 'kept'\n    content_file: custom.md\n",
        'utf8',
      );
    }

    it('writes a region indexing the user-invocable Rovo Dev skills, excluding non-invocable ones', async () => {
      await writeLibrarySkill('public-skill', 'description: Public skill');
      await writeLibrarySkill('internal-skill', 'user-invocable: false');
      await declareSkills('public-skill', 'internal-skill');

      await syncCommand(makeOptions({ harness: 'rovodev' }), projectRoot, contentDir);

      const prompts = await readFile(promptsYmlPath(), 'utf8');
      expect(prompts).toContain('# codeassembly:managed:start');
      expect(prompts).toContain('# codeassembly:managed:end');
      expect(prompts).toContain("name: 'public-skill'");
      expect(prompts).toContain('content_file: skills/public-skill/SKILL.md');
      expect(prompts).not.toContain('internal-skill');
    });

    it('leaves prompts.yml byte-identical on re-sync with no skill changes', async () => {
      await writeLibrarySkill('public-skill', 'description: Public skill');
      await declareSkills('public-skill');
      await syncCommand(makeOptions({ harness: 'rovodev' }), projectRoot, contentDir);
      const first = await readFile(promptsYmlPath(), 'utf8');

      await syncCommand(makeOptions({ harness: 'rovodev' }), projectRoot, contentDir);

      expect(await readFile(promptsYmlPath(), 'utf8')).toBe(first);
    });

    it('merges the region into a hand-authored prompts.yml, preserving foreign entries', async () => {
      await writeLibrarySkill('public-skill', 'description: Public skill');
      await declareSkills('public-skill');
      await seedHandAuthoredPromptsYml();

      await syncCommand(makeOptions({ harness: 'rovodev' }), projectRoot, contentDir);

      const prompts = await readFile(promptsYmlPath(), 'utf8');
      expect(prompts).toContain("name: 'hand-authored'");
      expect(prompts).toContain('content_file: custom.md');
      expect(prompts).toContain("name: 'public-skill'");
      expect(prompts).toContain('# codeassembly:managed:start');
    });

    it('removes the region and deletes the file when undeclaring leaves nothing foreign', async () => {
      await writeLibrarySkill('public-skill', 'description: Public skill');
      await declareSkills('public-skill');
      await syncCommand(makeOptions({ harness: 'rovodev' }), projectRoot, contentDir);
      expect(existsSync(promptsYmlPath())).toBe(true);

      await declareSkills();
      await syncCommand(makeOptions({ harness: 'rovodev' }), projectRoot, contentDir);

      expect(existsSync(promptsYmlPath())).toBe(false);
    });

    it('strips only the region and keeps the file when foreign entries remain', async () => {
      await writeLibrarySkill('public-skill', 'description: Public skill');
      await declareSkills('public-skill');
      await seedHandAuthoredPromptsYml();
      await syncCommand(makeOptions({ harness: 'rovodev' }), projectRoot, contentDir);
      expect(await readFile(promptsYmlPath(), 'utf8')).toContain('# codeassembly:managed:start');

      await declareSkills();
      await syncCommand(makeOptions({ harness: 'rovodev' }), projectRoot, contentDir);

      const prompts = await readFile(promptsYmlPath(), 'utf8');
      expect(prompts).toContain("name: 'hand-authored'");
      expect(prompts).not.toContain('# codeassembly:managed:start');
    });

    it('refuses to corrupt a flow-style hand-authored prompts.yml, leaving it unchanged', async () => {
      await writeLibrarySkill('public-skill', 'description: Public skill');
      await declareSkills('public-skill');
      await mkdir(path.join(projectRoot, '.rovodev'), { recursive: true });
      const flowAuthored = "prompts: [{ name: 'foreign', content_file: custom.md }]\n";
      await writeFile(promptsYmlPath(), flowAuthored, 'utf8');

      await expect(syncCommand(makeOptions({ harness: 'rovodev' }), projectRoot, contentDir)).rejects.toThrow(
        /block-style/,
      );

      expect(await readFile(promptsYmlPath(), 'utf8')).toBe(flowAuthored);
    });

    it('leaves a region-less prompts.yml untouched when no Rovo Dev skills are declared', async () => {
      await seedHandAuthoredPromptsYml();
      const handAuthored = await readFile(promptsYmlPath(), 'utf8');
      await declareSkills();

      await syncCommand(makeOptions({ harness: 'rovodev' }), projectRoot, contentDir);

      expect(await readFile(promptsYmlPath(), 'utf8')).toBe(handAuthored);
    });

    it('previews the prompts.yml reconciliation in dry-run without writing', async () => {
      await writeLibrarySkill('public-skill', 'description: Public skill');
      await declareSkills('public-skill');

      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      let output: string;
      try {
        await syncCommand(makeOptions({ harness: 'rovodev', dryRun: true }), projectRoot, contentDir);
        output = infoSpy.mock.calls.map((call) => String(call[0])).join('\n');
      } finally {
        infoSpy.mockRestore();
      }

      expect(output).toContain('prompts.yml');
      expect(existsSync(promptsYmlPath())).toBe(false);
    });
  });
});

describe(syncGlobalCommand, () => {
  let homeDir: string;
  let contentDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    homeDir = path.join(tmpdir(), `agents-test-sync-home-${stamp}`);
    contentDir = path.join(tmpdir(), `agents-test-sync-home-content-${stamp}`);
    await mkdir(homeDir, { recursive: true });
    await mkdir(path.join(contentDir, 'guidance', 'rulebooks'), { recursive: true });
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
    await rm(contentDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  /** Writes a fixture rulebook into the temp content library. */
  async function writeLibraryRulebook(slug: string, frontmatter: string, body: string): Promise<void> {
    const file = path.join(contentDir, 'guidance', 'rulebooks', `${slug}.md`);
    await writeFile(file, `---\nslug: ${slug}\n${frontmatter}\n---\n\n${body}\n`, 'utf8');
  }

  /** Writes a fixture skill into the temp content library. */
  async function writeLibrarySkill(slug: string): Promise<void> {
    const dir = path.join(contentDir, 'skills', slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\n---\n\n# ${slug}\n\nBody.\n`, 'utf8');
  }

  /** Writes the user-global codeassembly.yaml under the temp home's `.agents/`. */
  async function declareRaw(content: string): Promise<void> {
    await mkdir(path.join(homeDir, '.agents'), { recursive: true });
    await writeFile(path.join(homeDir, '.agents', 'codeassembly.yaml'), content, 'utf8');
  }

  it('when no ~/.agents/codeassembly.yaml exists, makes no changes and points at init --global', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    let infoLines: ReadonlyArray<string>;
    try {
      await syncGlobalCommand(makeOptions(), homeDir, contentDir);
      infoLines = infoSpy.mock.calls.map((call) => String(call[0]));
    } finally {
      infoSpy.mockRestore();
    }

    expect(existsSync(path.join(homeDir, '.agents', 'rulebooks'))).toBe(false);
    expect(infoLines.join('\n')).toContain('init --global');
  });

  it('deploys a declared skill into the home harness skills dir with the ownership marker', async () => {
    await writeLibrarySkill('people-report');
    await declareRaw('skills:\n  use:\n    - people-report\n');

    await syncGlobalCommand(makeOptions(), homeDir, contentDir);

    const skill = await readFile(path.join(homeDir, '.claude', 'skills', 'people-report', 'SKILL.md'), 'utf8');
    expect(skill).toContain('<!-- codeassembly-skill:people-report -->');
  });

  it('inlines ambient rulebooks into ~/.agents/GLOBAL.md, never PROJECT.md', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');

    await syncGlobalCommand(makeOptions(), homeDir, contentDir);

    const globalMd = await readFile(path.join(homeDir, '.agents', 'GLOBAL.md'), 'utf8');
    expect(globalMd).toContain('<!-- rulebook:alpha -->');
    expect(globalMd).toContain('Alpha rules.');
    expect(existsSync(path.join(homeDir, '.agents', 'PROJECT.md'))).toBe(false);
  });

  it('refuses to overwrite a home skill that lacks the sync ownership marker', async () => {
    await writeLibrarySkill('people-report');
    await declareRaw('skills:\n  use:\n    - people-report\n');
    const target = path.join(homeDir, '.claude', 'skills', 'people-report');
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, 'SKILL.md'), '---\nname: people-report\n---\n\n# Hand-authored\n', 'utf8');

    await expect(syncGlobalCommand(makeOptions(), homeDir, contentDir)).rejects.toThrow(/not owned by sync/i);
    expect(await readFile(path.join(target, 'SKILL.md'), 'utf8')).toContain('Hand-authored');
  });

  it('refuses a bare sync run rooted at the home directory, directing to --global', async () => {
    await expect(syncCommand(makeOptions(), homedir(), contentDir)).rejects.toThrow(/--global/);
  });

  it('retracts a home ambient block on undeclare and never writes ~/.agents/AGENTS.md', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');
    await syncGlobalCommand(makeOptions(), homeDir, contentDir);
    expect(await readFile(path.join(homeDir, '.agents', 'GLOBAL.md'), 'utf8')).toContain('<!-- rulebook:alpha -->');

    await declareRaw('rulebooks:\n  use: []\n');
    await syncGlobalCommand(makeOptions(), homeDir, contentDir);

    const globalMd = await readFile(path.join(homeDir, '.agents', 'GLOBAL.md'), 'utf8');
    expect(globalMd).not.toContain('<!-- rulebook:alpha -->');
    expect(existsSync(path.join(homeDir, '.agents', 'AGENTS.md'))).toBe(false);
  });

  it('refreshes ~/.rovodev/prompts.yml with home-deployed Rovo Dev skills through the managed region', async () => {
    await writeLibrarySkill('people-report');
    await declareRaw('skills:\n  use:\n    - people-report\n');

    await syncGlobalCommand(makeOptions({ harness: 'rovodev' }), homeDir, contentDir);

    const prompts = await readFile(path.join(homeDir, '.rovodev', 'prompts.yml'), 'utf8');
    expect(prompts).toContain('# codeassembly:managed:start');
    expect(prompts).toContain("name: 'people-report'");
    expect(prompts).toContain('content_file: skills/people-report/SKILL.md');
  });

  it('merges the home prompts.yml region into a hand-authored file, preserving foreign entries', async () => {
    await writeLibrarySkill('people-report');
    await declareRaw('skills:\n  use:\n    - people-report\n');
    await mkdir(path.join(homeDir, '.rovodev'), { recursive: true });
    await writeFile(
      path.join(homeDir, '.rovodev', 'prompts.yml'),
      "prompts:\n  - name: 'hand-authored'\n    description: 'kept'\n    content_file: custom.md\n",
      'utf8',
    );

    await syncGlobalCommand(makeOptions({ harness: 'rovodev' }), homeDir, contentDir);

    const prompts = await readFile(path.join(homeDir, '.rovodev', 'prompts.yml'), 'utf8');
    expect(prompts).toContain("name: 'hand-authored'");
    expect(prompts).toContain('content_file: custom.md');
    expect(prompts).toContain("name: 'people-report'");
    expect(prompts).toContain('# codeassembly:managed:start');
  });

  it('deploys the real recommended collection to home via the user-global declaration', async () => {
    await declareRaw('collections:\n  use:\n    - recommended\n');

    await syncGlobalCommand(makeOptions({ harness: 'claude' }), homeDir, resolveContentDir());

    expect(existsSync(path.join(homeDir, '.claude', 'skills', 'people-report', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(homeDir, '.claude', 'agents', 'canary.md'))).toBe(true);
  });

  it('reconciles ~/.agents/rulebooks/ as wholesale sync-owned, removing an undeclared neutral file', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await declareRaw('rulebooks:\n  use:\n    - alpha\n');
    await syncGlobalCommand(makeOptions(), homeDir, contentDir);
    await writeFile(path.join(homeDir, '.agents', 'rulebooks', 'stray.md'), '# Stray\n', 'utf8');

    await syncGlobalCommand(makeOptions(), homeDir, contentDir);

    expect(existsSync(path.join(homeDir, '.agents', 'rulebooks', 'stray.md'))).toBe(false);
    expect(existsSync(path.join(homeDir, '.agents', 'rulebooks', 'alpha.md'))).toBe(true);
  });
});
