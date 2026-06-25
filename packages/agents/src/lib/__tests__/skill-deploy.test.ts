import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deploySkill, resolveDeclaredSkill } from '../skill-deploy.ts';

describe(resolveDeclaredSkill, () => {
  let librarySkillsDir: string;

  beforeEach(() => {
    librarySkillsDir = path.join(tmpdir(), `agents-test-sd-lib-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await rm(librarySkillsDir, { recursive: true, force: true });
  });

  /** Writes a library skill `<slug>/SKILL.md` with the given frontmatter lines. */
  async function writeLibrarySkill(slug: string, frontmatter: string): Promise<void> {
    const dir = path.join(librarySkillsDir, slug);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'SKILL.md'),
      `---\nname: ${slug}\n${frontmatter}\n---\n\n# ${slug}\n\nBody.\n`,
      'utf8',
    );
  }

  it('resolves a declared skill to its slug and source directory', async () => {
    await writeLibrarySkill('people-report', 'deploy: declared');

    const resolved = await resolveDeclaredSkill('people-report', librarySkillsDir);

    expect(resolved.slug).toBe('people-report');
    expect(resolved.srcDir).toBe(path.join(librarySkillsDir, 'people-report'));
  });

  it('throws a clear error naming the slug when the skill is missing from the library', async () => {
    await expect(resolveDeclaredSkill('ghost', librarySkillsDir)).rejects.toThrow(/ghost/);
  });

  it('throws when the declared skill is still on the install path', async () => {
    await writeLibrarySkill('legacy', 'deploy: install');

    await expect(resolveDeclaredSkill('legacy', librarySkillsDir)).rejects.toThrow(/legacy.*declared/i);
  });

  it('throws when the declared skill has no deploy field', async () => {
    await writeLibrarySkill('unmarked', 'description: x');

    await expect(resolveDeclaredSkill('unmarked', librarySkillsDir)).rejects.toThrow(/unmarked.*declared/i);
  });
});

describe(deploySkill, () => {
  let librarySkillsDir: string;
  let destParent: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    librarySkillsDir = path.join(tmpdir(), `agents-test-sd-lib-${stamp}`);
    destParent = path.join(tmpdir(), `agents-test-sd-dest-${stamp}`);
    await mkdir(destParent, { recursive: true });
  });

  afterEach(async () => {
    await rm(librarySkillsDir, { recursive: true, force: true });
    await rm(destParent, { recursive: true, force: true });
  });

  /** Writes a library skill directory from a map of relative file paths to contents. */
  async function writeLibrarySkill(slug: string, files: Record<string, string>): Promise<void> {
    for (const [relPath, content] of Object.entries(files)) {
      const full = path.join(librarySkillsDir, slug, relPath);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content, 'utf8');
    }
  }

  it('writes the SKILL.md with the ownership marker into the destination', async () => {
    await writeLibrarySkill('people-report', { 'SKILL.md': '---\nname: people-report\n---\n\n# People report\n' });
    const skill = resolvedSkill('people-report');
    const destDir = path.join(destParent, 'people-report');

    await deploySkill(skill, destDir);

    const deployed = await readFile(path.join(destDir, 'SKILL.md'), 'utf8');
    expect(deployed).toContain('<!-- codeassembly-skill:people-report -->');
    expect(deployed).toContain('# People report');
  });

  it('re-deploys an unchanged single-file skill without rewriting SKILL.md', async () => {
    await writeLibrarySkill('people-report', { 'SKILL.md': '---\nname: people-report\n---\n\n# People report\n' });
    const skill = resolvedSkill('people-report');
    const destDir = path.join(destParent, 'people-report');
    await deploySkill(skill, destDir);
    const firstMtime = statSync(path.join(destDir, 'SKILL.md')).mtimeMs;

    await deploySkill(skill, destDir);

    expect(statSync(path.join(destDir, 'SKILL.md')).mtimeMs).toBe(firstMtime);
  });

  it('mirrors auxiliary files and subdirectories verbatim, marking only the root SKILL.md', async () => {
    await writeLibrarySkill('multi', {
      'SKILL.md': '---\nname: multi\n---\n\n# Multi\n',
      'reference.md': '# Reference\n',
      'data/table.csv': 'a,b\n1,2\n',
    });
    const skill = resolvedSkill('multi');
    const destDir = path.join(destParent, 'multi');

    await deploySkill(skill, destDir);

    expect(await readFile(path.join(destDir, 'reference.md'), 'utf8')).toBe('# Reference\n');
    expect(await readFile(path.join(destDir, 'data', 'table.csv'), 'utf8')).toBe('a,b\n1,2\n');
    // The marker belongs only on the root SKILL.md.
    expect(await readFile(path.join(destDir, 'reference.md'), 'utf8')).not.toContain('codeassembly-skill');
  });

  it('removes a destination file the source no longer carries on re-deploy', async () => {
    await writeLibrarySkill('multi', { 'SKILL.md': '---\nname: multi\n---\n\n# Multi\n', 'stale.md': 'old\n' });
    const destDir = path.join(destParent, 'multi');
    await deploySkill(resolvedSkill('multi'), destDir);
    expect(existsSync(path.join(destDir, 'stale.md'))).toBe(true);

    await rm(path.join(librarySkillsDir, 'multi', 'stale.md'));
    await deploySkill(resolvedSkill('multi'), destDir);

    expect(existsSync(path.join(destDir, 'stale.md'))).toBe(false);
    expect(existsSync(path.join(destDir, 'SKILL.md'))).toBe(true);
  });

  /** Builds a ResolvedSkill without the deploy-field check, so deploySkill tests can use minimal fixtures. */
  function resolvedSkill(slug: string): { slug: string; srcDir: string } {
    return { slug, srcDir: path.join(librarySkillsDir, slug) };
  }
});
