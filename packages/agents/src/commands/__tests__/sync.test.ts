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
    return { platform: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  /** Writes a fixture rulebook into the temp content library. */
  async function writeLibraryRulebook(slug: string, frontmatter: string, body: string): Promise<void> {
    const file = path.join(contentDir, 'guidance', 'rulebooks', `${slug}.md`);
    await writeFile(file, `---\nslug: ${slug}\n${frontmatter}\n---\n\n${body}\n`, 'utf8');
  }

  /** Writes the project-scope rulebooks.yaml. */
  async function writeManifest(content: string): Promise<void> {
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await writeFile(path.join(projectRoot, '.agents', 'rulebooks.yaml'), content, 'utf8');
  }

  function neutralPath(slug: string): string {
    return path.join(projectRoot, '.agents', 'rulebooks', `${slug}.md`);
  }

  const projectMdPath = (): string => path.join(projectRoot, '.agents', 'PROJECT.md');

  const skillPath = (slug: string, dotDir = '.claude'): string =>
    path.join(projectRoot, dotDir, 'skills', slug, 'SKILL.md');

  it('when no rulebooks.yaml exists, makes no changes', async () => {
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(path.join(projectRoot, '.agents', 'rulebooks'))).toBe(false);
    expect(existsSync(projectMdPath())).toBe(false);
  });

  it('writes the neutral body with frontmatter stripped for a declared rulebook', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', '# Alpha\n\nAlpha rules.');
    await writeManifest('rulebooks:\n  - alpha\n');

    await syncCommand(makeOptions(), projectRoot, contentDir);

    const neutral = await readFile(neutralPath('alpha'), 'utf8');
    expect(neutral).toBe('# Alpha\n\nAlpha rules.\n');
    expect(neutral).not.toContain('slug:');
  });

  it('inlines an ambient rulebook into PROJECT.md between sentinels, creating the file', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', '# Alpha\n\nAlpha rules.');
    await writeManifest('rulebooks:\n  - alpha\n');

    await syncCommand(makeOptions(), projectRoot, contentDir);

    const projectMd = await readFile(projectMdPath(), 'utf8');
    expect(projectMd).toContain('<!-- rulebook:alpha -->');
    expect(projectMd).toContain('<!-- /rulebook:alpha -->');
    expect(projectMd).toContain('Alpha rules.');
  });

  it('preserves hand-authored PROJECT.md content when inlining', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await writeManifest('rulebooks:\n  - alpha\n');
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await writeFile(projectMdPath(), '# Project\n\nHand-authored intro.\n', 'utf8');

    await syncCommand(makeOptions(), projectRoot, contentDir);

    const projectMd = await readFile(projectMdPath(), 'utf8');
    expect(projectMd).toContain('Hand-authored intro.');
    expect(projectMd).toContain('<!-- rulebook:alpha -->');
  });

  it('when re-run with the same manifest, produces no file changes', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', '# Alpha\n\nAlpha rules.');
    await writeManifest('rulebooks:\n  - alpha\n');

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
    await writeManifest('rulebooks:\n  - alpha\n  - beta\n');
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(neutralPath('beta'))).toBe(true);

    await writeManifest('rulebooks:\n  - alpha\n');
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(neutralPath('beta'))).toBe(false);
    expect(existsSync(neutralPath('alpha'))).toBe(true);
    const projectMd = await readFile(projectMdPath(), 'utf8');
    expect(projectMd).not.toContain('<!-- rulebook:beta -->');
    expect(projectMd).toContain('<!-- rulebook:alpha -->');
  });

  it('retracts the inlined block when a rulebook delivery changes away from ambient', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await writeManifest('rulebooks:\n  - alpha\n');
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
    await writeManifest('rulebooks:\n  - alpha\n');
    await syncCommand(makeOptions(), projectRoot, contentDir);
    expect(existsSync(neutralPath('alpha'))).toBe(true);

    await writeManifest('rulebooks: []\n');
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(neutralPath('alpha'))).toBe(false);
    expect(await readFile(projectMdPath(), 'utf8')).not.toContain('<!-- rulebook:alpha -->');
  });

  it('throws when a declared rulebook has no library file', async () => {
    await writeManifest('rulebooks:\n  - ghost\n');

    await expect(syncCommand(makeOptions(), projectRoot, contentDir)).rejects.toThrow(/ghost/);
  });

  it('writes a skill file for a skill-only rulebook without inlining it into PROJECT.md', async () => {
    await writeLibraryRulebook('gamma', 'delivery: skill\ndescription: Gamma desc.', 'Gamma rules.');
    await writeManifest('rulebooks:\n  - gamma\n');

    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(neutralPath('gamma'))).toBe(true);
    expect(existsSync(projectMdPath())).toBe(false);
    const skill = await readFile(skillPath('gamma'), 'utf8');
    expect(skill).toContain('name: gamma');
    expect(skill).toContain('description: Gamma desc.');
    expect(skill).toContain('<!-- codeassembly-rulebook:gamma -->');
    expect(skill).toContain('Gamma rules.');
  });

  it('writes a skill file for a multi-modal rulebook and also inlines it into PROJECT.md', async () => {
    await writeLibraryRulebook('delta', 'delivery: [ambient, skill]', 'Delta rules.');
    await writeManifest('rulebooks:\n  - delta\n');

    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(await readFile(projectMdPath(), 'utf8')).toContain('<!-- rulebook:delta -->');
    expect(await readFile(skillPath('delta'), 'utf8')).toContain('Delta rules.');
  });

  it('when re-run with unchanged content, does not rewrite the skill file', async () => {
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await writeManifest('rulebooks:\n  - gamma\n');
    await syncCommand(makeOptions(), projectRoot, contentDir);
    const firstMtime = statSync(skillPath('gamma')).mtimeMs;

    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(statSync(skillPath('gamma')).mtimeMs).toBe(firstMtime);
  });

  it('retracts the skill directory when a skill rulebook is no longer declared', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await writeManifest('rulebooks:\n  - alpha\n  - gamma\n');
    await syncCommand(makeOptions(), projectRoot, contentDir);
    expect(existsSync(skillPath('gamma'))).toBe(true);

    await writeManifest('rulebooks:\n  - alpha\n');
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(path.dirname(skillPath('gamma')))).toBe(false);
  });

  it('retracts the skill directory when a rulebook delivery changes away from skill', async () => {
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await writeManifest('rulebooks:\n  - gamma\n');
    await syncCommand(makeOptions(), projectRoot, contentDir);
    expect(existsSync(skillPath('gamma'))).toBe(true);

    await writeLibraryRulebook('gamma', 'delivery: ambient', 'Gamma rules.');
    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(path.dirname(skillPath('gamma')))).toBe(false);
    expect(existsSync(neutralPath('gamma'))).toBe(true);
  });

  it('with --platform claude, writes only the Claude skills dir', async () => {
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await writeManifest('rulebooks:\n  - gamma\n');

    await syncCommand(makeOptions({ platform: 'claude' }), projectRoot, contentDir);

    expect(existsSync(skillPath('gamma', '.claude'))).toBe(true);
    expect(existsSync(skillPath('gamma', '.rovodev'))).toBe(false);
  });

  it('with no detected platform, writes no skill files but still writes the neutral file', async () => {
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await writeManifest('rulebooks:\n  - gamma\n');

    await syncCommand(makeOptions({ platform: 'all' }), projectRoot, contentDir);

    expect(existsSync(neutralPath('gamma'))).toBe(true);
    expect(existsSync(skillPath('gamma'))).toBe(false);
  });

  it('never deletes a hand-authored skill that lacks the sync marker', async () => {
    const manualSkill = skillPath('manual');
    await mkdir(path.dirname(manualSkill), { recursive: true });
    await writeFile(manualSkill, '---\nname: manual\n---\n\n# Hand-authored\n', 'utf8');
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await writeManifest('rulebooks:\n  - gamma\n');

    await syncCommand(makeOptions(), projectRoot, contentDir);

    expect(existsSync(manualSkill)).toBe(true);
    expect(existsSync(skillPath('gamma'))).toBe(true);
  });

  it('in dry-run mode, writes nothing to disk', async () => {
    await writeLibraryRulebook('alpha', 'delivery: ambient', 'Alpha rules.');
    await writeLibraryRulebook('gamma', 'delivery: skill', 'Gamma rules.');
    await writeManifest('rulebooks:\n  - alpha\n  - gamma\n');

    await syncCommand(makeOptions({ dryRun: true }), projectRoot, contentDir);

    expect(existsSync(neutralPath('alpha'))).toBe(false);
    expect(existsSync(projectMdPath())).toBe(false);
    expect(existsSync(skillPath('gamma'))).toBe(false);
  });

  it('materializes the real shell-conventions rulebook from the package content', async () => {
    await writeManifest('rulebooks:\n  - shell-conventions\n');

    await syncCommand(makeOptions(), projectRoot, resolveContentDir());

    const neutral = await readFile(neutralPath('shell-conventions'), 'utf8');
    expect(neutral).toContain('# Shell script conventions');
    expect(neutral).not.toContain('slug:');
    const projectMd = await readFile(projectMdPath(), 'utf8');
    expect(projectMd).toContain('<!-- rulebook:shell-conventions -->');
    const skill = await readFile(skillPath('shell-conventions'), 'utf8');
    expect(skill).toContain('name: shell-conventions');
    expect(skill).toContain('# Shell script conventions');
  });
});
