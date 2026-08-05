import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { validateCommand } from '../validate.ts';

describe(validateCommand, () => {
  let projectDir: string;

  beforeEach(async () => {
    // Under the OS temp dir, never the repo tree: this repo carries `.agents/codeassembly.yaml` at its root, so an
    // in-tree fixture would sit below a declaration and could not show that the command consults none.
    projectDir = path.join(tmpdir(), `agents-test-validate-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(projectDir, { recursive: true });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(projectDir, { recursive: true, force: true });
  });

  it('reports a clean content root as valid, with no codeassembly.yaml anywhere above it', async () => {
    await writeSkill(path.join(projectDir, 'content'), 'alpha');

    expect(await validateCommand({ content: 'content', harness: 'all' }, projectDir)).toBe(true);
  });

  it('reports a defective content root as invalid, naming the offending file and the reason', async () => {
    await writeSkill(path.join(projectDir, 'content'), 'alpha', 'Invoke {tool:NoSuchTool}.');

    expect(await validateCommand({ content: 'content', harness: 'all' }, projectDir)).toBe(false);
    const report = reportedText();
    expect(report).toContain('skills/alpha/SKILL.md');
    expect(report).toContain('NoSuchTool');
    expect(report).toContain('[render]');
  });

  it('reports a skill declaring the same guidance hook twice, naming the offending file', async () => {
    await writeSkill(
      path.join(projectDir, 'content'),
      'alpha',
      '<!-- guidance-hook: preferences -->\n<!-- guidance-hook: preferences -->',
    );

    expect(await validateCommand({ content: 'content', harness: 'all' }, projectDir)).toBe(false);
    const report = reportedText();
    expect(report).toContain('skills/alpha/SKILL.md');
    expect(report).toContain('reason=duplicate-hook');
  });

  it("falls back to the content root the working directory's package.json declares", async () => {
    await writeSkill(path.join(projectDir, 'guidance'), 'alpha');
    await writeManifest(projectDir, { codeassembly: { content: 'guidance' } });

    expect(await validateCommand({ harness: 'all' }, projectDir)).toBe(true);
  });

  it('prefers an explicit --content over the declared key', async () => {
    await writeSkill(path.join(projectDir, 'guidance'), 'alpha', 'Invoke {tool:NoSuchTool}.');
    await writeSkill(path.join(projectDir, 'other'), 'beta');
    await writeManifest(projectDir, { codeassembly: { content: 'guidance' } });

    expect(await validateCommand({ content: 'other', harness: 'all' }, projectDir)).toBe(true);
  });

  it('names both routes when neither yields a content root', async () => {
    await writeManifest(projectDir, { name: 'no-content-here' });

    await expect(validateCommand({ harness: 'all' }, projectDir)).rejects.toThrow(/--content <dir>/);
  });

  it('names both routes when the working directory has no package.json at all', async () => {
    await expect(validateCommand({ harness: 'all' }, projectDir)).rejects.toThrow(/--content <dir>/);
  });

  it('checks only the named harness when one is given', async () => {
    await writeSkill(path.join(projectDir, 'content'), 'alpha');

    expect(await validateCommand({ content: 'content', harness: 'rovo' }, projectDir)).toBe(true);
    expect(loggedText()).toContain('against rovo');
  });
});

/** The joined text of every `console.info` call, for asserting on the run header. */
function loggedText(): string {
  return vi
    .mocked(console.info)
    .mock.calls.map((call) => String(call[0]))
    .join('\n');
}

/** The joined text of every `console.error` call, which is where the defect report lands. */
function reportedText(): string {
  return vi
    .mocked(console.error)
    .mock.calls.map((call) => String(call[0]))
    .join('\n');
}

/** Writes a `package.json` holding the given manifest object. */
async function writeManifest(dir: string, manifest: Record<string, unknown>): Promise<void> {
  await writeFile(path.join(dir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8');
}

/** Writes a minimal skill into a content root, with an optional body carrying whatever the test is exercising. */
async function writeSkill(root: string, slug: string, body = 'Body.'): Promise<void> {
  const skillDir = path.join(root, 'skills', slug);
  await mkdir(skillDir, { recursive: true });
  const frontmatter = ['---', `name: ${slug}`, `description: ${slug} fixture skill`, '---'];
  await writeFile(path.join(skillDir, 'SKILL.md'), `${frontmatter.join('\n')}\n\n# ${slug}\n\n${body}\n`, 'utf8');
}
