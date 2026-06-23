import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveContentDir } from '../../lib/content-resolver.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { syncCommand } from '../sync.ts';

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
    expect(await readFile(projectMdPath(), 'utf8')).toContain('<!-- rulebook:shell-conventions -->');
    const skill = await readFile(skillPath('consult-shell-conventions'), 'utf8');
    expect(skill).toContain('name: consult-shell-conventions');
    expect(skill).toContain('# Shell script conventions');

    await declareRulebooks();
    await syncCommand(makeOptions(), projectRoot, resolveContentDir());

    expect(existsSync(neutralPath('shell-conventions'))).toBe(false);
    expect(await readFile(projectMdPath(), 'utf8')).not.toContain('<!-- rulebook:shell-conventions -->');
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
});
