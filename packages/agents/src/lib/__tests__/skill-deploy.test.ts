import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expandIncludes } from '../directive-expander.ts';
import { rewriteMarkdownPaths, rewriteTemplateVariables } from '../path-rewriter.ts';
import { deploySkill, resolveDeclaredSkill } from '../skill-deploy.ts';
import { type SkillDeployContext } from '../skill-transform.ts';
import { rewriteToolNames } from '../tool-name-rewriter.ts';

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

  it('writes the SKILL.md with the ownership marker into the destination', async () => {
    await writeLibrarySkill('people-report', { 'SKILL.md': '---\nname: people-report\n---\n\n# People report\n' });
    const destDir = path.join(destParent, 'people-report');

    await deploySkill(resolvedSkill('people-report'), destDir, context());

    const deployed = await readFile(path.join(destDir, 'SKILL.md'), 'utf8');
    expect(deployed).toContain('<!-- codeassembly-skill:people-report -->');
    expect(deployed).toContain('# People report');
  });

  it('re-deploys an unchanged skill without rewriting SKILL.md', async () => {
    await writeLibrarySkill('people-report', { 'SKILL.md': '---\nname: people-report\n---\n\n# People report\n' });
    const destDir = path.join(destParent, 'people-report');
    await deploySkill(resolvedSkill('people-report'), destDir, context());
    const firstMtime = statSync(path.join(destDir, 'SKILL.md')).mtimeMs;

    await deploySkill(resolvedSkill('people-report'), destDir, context());

    expect(statSync(path.join(destDir, 'SKILL.md')).mtimeMs).toBe(firstMtime);
  });

  it('mirrors auxiliary assets verbatim and marks only the root SKILL.md', async () => {
    await writeLibrarySkill('multi', {
      'SKILL.md': '---\nname: multi\n---\n\n# Multi\n',
      'reference.md': '# Reference\n',
      'data/table.csv': 'a,b\n1,2\n',
    });
    const destDir = path.join(destParent, 'multi');

    await deploySkill(resolvedSkill('multi'), destDir, context());

    expect(await readFile(path.join(destDir, 'reference.md'), 'utf8')).toBe('# Reference\n');
    expect(await readFile(path.join(destDir, 'data', 'table.csv'), 'utf8')).toBe('a,b\n1,2\n');
    expect(await readFile(path.join(destDir, 'reference.md'), 'utf8')).not.toContain('codeassembly-skill');
  });

  it('removes a destination file the source no longer carries on re-deploy', async () => {
    await writeLibrarySkill('multi', { 'SKILL.md': '---\nname: multi\n---\n\n# Multi\n', 'stale.md': 'old\n' });
    const destDir = path.join(destParent, 'multi');
    await deploySkill(resolvedSkill('multi'), destDir, context());
    expect(existsSync(path.join(destDir, 'stale.md'))).toBe(true);

    await rm(path.join(librarySkillsDir, 'multi', 'stale.md'));
    await deploySkill(resolvedSkill('multi'), destDir, context());

    expect(existsSync(path.join(destDir, 'stale.md'))).toBe(false);
    expect(existsSync(path.join(destDir, 'SKILL.md'))).toBe(true);
  });

  it('expands includes and rewrites tool placeholders and bare-relative links in deployed .md files', async () => {
    await writeLibrarySkill('demo', {
      'SKILL.md':
        '---\nname: demo\n---\n\n<!-- include: _partials/frag.md / -->\n\nUse {tool:Read}. See [guide](./reference/guide.md).\n',
      '_partials/frag.md': 'Shared fragment.\n',
      'reference/guide.md': 'Back to [home](../SKILL.md). Run `{harness_home_dir}/x`.\n',
    });
    const destDir = path.join(destParent, 'demo');

    await deploySkill(resolvedSkill('demo'), destDir, context(new Map([['Read', 'open_files']])));

    const skillMd = await readFile(path.join(destDir, 'SKILL.md'), 'utf8');
    expect(skillMd).toContain('Shared fragment.');
    expect(skillMd).toContain('Use open_files.');
    expect(skillMd).toContain('[guide](~/.claude/skills/demo/reference/guide.md)');
    expect(skillMd).not.toContain('{tool:Read}');
    const guide = await readFile(path.join(destDir, 'reference', 'guide.md'), 'utf8');
    expect(guide).toContain('[home](~/.claude/skills/demo/SKILL.md)');
    expect(guide).toContain('~/.claude/x');
    // The partial is an include target, never deployed.
    expect(existsSync(path.join(destDir, '_partials'))).toBe(false);
  });

  it('deploys the same body install composes from the shared transform steps, markers aside', async () => {
    const toolMapping = new Map([['Read', 'open_files']]);
    await writeLibrarySkill('demo', {
      'SKILL.md':
        '---\nname: demo\n---\n\nUse {tool:Read}. See [guide](./reference/guide.md). Run `{harness_home_dir}/x`.\n',
      'reference/guide.md': '# Guide\n',
    });
    const destDir = path.join(destParent, 'demo');

    await deploySkill(resolvedSkill('demo'), destDir, context(toolMapping));

    // Recompose install's pipeline for SKILL.md independently: expand → tools → markdown paths → template vars.
    const expanded = await expandIncludes(path.join(librarySkillsDir, 'demo', 'SKILL.md'), librarySkillsDir);
    const tooled = rewriteToolNames(expanded, toolMapping, 'demo/SKILL.md');
    const pathed = rewriteMarkdownPaths(tooled, 'demo/SKILL.md', '.claude/skills');
    const expected = rewriteTemplateVariables(pathed, '.claude', 'claude');

    const deployed = await readFile(path.join(destDir, 'SKILL.md'), 'utf8');
    const withoutMarker = deployed
      .split('\n')
      .filter((line) => !line.includes('codeassembly-skill:'))
      .join('\n');
    expect(withoutMarker).toBe(expected);
  });

  // region | Helpers

  function context(toolMapping: ReadonlyMap<string, string> = new Map()): SkillDeployContext {
    return {
      contentDir: librarySkillsDir,
      toolMapping,
      pathPrefix: '.claude/skills',
      homeDir: '.claude',
      harnessId: 'claude',
    };
  }

  /** Writes a library skill directory from a map of relative file paths to contents. */
  async function writeLibrarySkill(slug: string, files: Record<string, string>): Promise<void> {
    for (const [relPath, content] of Object.entries(files)) {
      const full = path.join(librarySkillsDir, slug, relPath);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content, 'utf8');
    }
  }

  /** Builds a ResolvedSkill without the deploy-field check, so deploySkill tests can use minimal fixtures. */
  function resolvedSkill(slug: string): { slug: string; srcDir: string } {
    return { slug, srcDir: path.join(librarySkillsDir, slug) };
  }

  // endregion | Helpers
});
