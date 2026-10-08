import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type CapturedStdio, captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { disposeOnTestFinished } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { validateCommand } from '../validate.ts';

describe(validateCommand, () => {
  let projectDir: string;
  let stdio: CapturedStdio;

  beforeEach(async () => {
    // Under the OS temp dir, never the repo tree: This repo contains `.agents/codeassembly.yaml` at its root, so an
    // in-tree fixture would be below a declaration and could not show that the command consults none.
    projectDir = path.join(tmpdir(), `agents-test-validate-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(projectDir, { recursive: true });
    stdio = disposeOnTestFinished(captureStdio({ includeConsole: true }));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('reports a clean content root as valid, without a codeassembly.yaml anywhere above it', async () => {
    await writeSkill(path.join(projectDir, 'content'), 'alpha');

    expect(await validateCommand({ content: 'content', harness: 'all' }, projectDir)).toBe(true);
  });

  it('reports a defective content root as invalid, naming the offending file and the reason', async () => {
    await writeSkill(path.join(projectDir, 'content'), 'alpha', 'Invoke {tool:NoSuchTool}.');

    expect(await validateCommand({ content: 'content', harness: 'all' }, projectDir)).toBe(false);
    expect(stdio.stderr).toContain('skills/alpha/SKILL.md');
    expect(stdio.stderr).toContain('NoSuchTool');
    expect(stdio.stderr).toContain('[render]');
  });

  it('reports a skill declaring the same guidance hook twice, naming the offending file', async () => {
    await writeSkill(
      path.join(projectDir, 'content'),
      'alpha',
      '<!-- guidance-hook: preferences -->\n<!-- guidance-hook: preferences -->',
    );

    expect(await validateCommand({ content: 'content', harness: 'all' }, projectDir)).toBe(false);
    expect(stdio.stderr).toContain('skills/alpha/SKILL.md');
    expect(stdio.stderr).toContain('reason=duplicate-hook');
  });

  it("falls back to the content root declared by the working directory's package.json", async () => {
    await writeSkill(path.join(projectDir, 'guidance'), 'alpha');
    await writeManifest(projectDir, { codeassembly: { content: 'guidance' } });

    expect(await validateCommand({ harness: 'all' }, projectDir)).toBe(true);
  });

  it('fails naming its own purpose when no content root resolves', async () => {
    await expect(validateCommand({ harness: 'all' }, projectDir)).rejects.toThrow(/^No content root to validate:/);
  });

  it('checks only the named harness when one is given', async () => {
    await writeSkill(path.join(projectDir, 'content'), 'alpha');

    expect(await validateCommand({ content: 'content', harness: 'rovo' }, projectDir)).toBe(true);
    expect(stdio.stdout).toContain('against rovo');
  });
});

/** Writes a `package.json` containing the given manifest object. */
async function writeManifest(dir: string, manifest: Record<string, unknown>): Promise<void> {
  await writeFile(path.join(dir, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8');
}

/** Writes a minimal skill into a content root, with an optional body containing whatever the test is exercising. */
async function writeSkill(root: string, slug: string, body = 'Body.'): Promise<void> {
  const skillDir = path.join(root, 'skills', slug);
  await mkdir(skillDir, { recursive: true });
  const frontmatter = ['---', `name: ${slug}`, `description: ${slug} fixture skill`, '---'];
  await writeFile(path.join(skillDir, 'SKILL.md'), `${frontmatter.join('\n')}\n\n# ${slug}\n\n${body}\n`, 'utf8');
}
