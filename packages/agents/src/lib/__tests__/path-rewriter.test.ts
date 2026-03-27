import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { rewriteMarkdownPaths, rewritePathsInDirectory } from '../path-rewriter.js';

describe(rewriteMarkdownPaths, () => {
  const skillsPrefix = '.claude/skills';

  it.each([
    {
      name: 'rewrites a relative ../_data/ link',
      fileRelPath: 'commit/SKILL.md',
      content: 'See [commit-format.md](../_data/commit-format.md) for details.',
      expected: 'See [commit-format.md](~/.claude/skills/_data/commit-format.md) for details.',
    },
    {
      name: 'preserves anchor fragments',
      fileRelPath: 'review-criteria/SKILL.md',
      content:
        'See [finding scheme](../_data/artifact-conventions.md#finding-scheme-fwtrs--legacy-suffix) for criteria.',
      expected:
        'See [finding scheme](~/.claude/skills/_data/artifact-conventions.md#finding-scheme-fwtrs--legacy-suffix) for criteria.',
    },
    {
      name: 'leaves URL links untouched',
      fileRelPath: 'commit/SKILL.md',
      content: 'Visit [docs](https://example.com/docs) for info.',
      expected: 'Visit [docs](https://example.com/docs) for info.',
    },
    {
      name: 'leaves http URL links untouched',
      fileRelPath: 'commit/SKILL.md',
      content: 'Visit [docs](http://example.com/docs) for info.',
      expected: 'Visit [docs](http://example.com/docs) for info.',
    },
    {
      name: 'leaves absolute paths untouched',
      fileRelPath: 'commit/SKILL.md',
      content: 'See [file](/absolute/path.md) for info.',
      expected: 'See [file](/absolute/path.md) for info.',
    },
    {
      name: 'leaves tilde-prefixed paths untouched',
      fileRelPath: 'commit/SKILL.md',
      content: 'See [file](~/.claude/skills/_data/commit-format.md) for info.',
      expected: 'See [file](~/.claude/skills/_data/commit-format.md) for info.',
    },
    {
      name: 'handles nested file paths correctly',
      fileRelPath: 'orchestrate/modules/review-cycle.md',
      content: 'See [conventions](../../_data/artifact-conventions.md) for details.',
      expected: 'See [conventions](~/.claude/skills/_data/artifact-conventions.md) for details.',
    },
    {
      name: 'handles sibling-directory relative links',
      fileRelPath: 'orchestrate-dev/SKILL.md',
      content: 'See [review-criteria](../review-criteria/SKILL.md) for the scheme.',
      expected: 'See [review-criteria](~/.claude/skills/review-criteria/SKILL.md) for the scheme.',
    },
    {
      name: 'handles same-directory relative links',
      fileRelPath: 'orchestrate/SKILL.md',
      content: 'See [review cycle](./modules/review-cycle.md) for details.',
      expected: 'See [review cycle](~/.claude/skills/orchestrate/modules/review-cycle.md) for details.',
    },
    {
      name: 'leaves anchor-only links untouched',
      fileRelPath: 'prepare-pr/SKILL.md',
      content: 'See [Saving](#saving) section.',
      expected: 'See [Saving](#saving) section.',
    },
    {
      name: 'rewrites multiple links in the same content',
      fileRelPath: 'commit/SKILL.md',
      content: 'See [format](../_data/commit-format.md) and [types](../_data/work-types.md).',
      expected:
        'See [format](~/.claude/skills/_data/commit-format.md) and [types](~/.claude/skills/_data/work-types.md).',
    },
  ])('$name', ({ fileRelPath, content, expected }) => {
    expect(rewriteMarkdownPaths(content, fileRelPath, skillsPrefix)).toBe(expected);
  });

  it('returns empty content unchanged', () => {
    expect(rewriteMarkdownPaths('', 'commit/SKILL.md', skillsPrefix)).toBe('');
  });

  it('returns content with no links unchanged', () => {
    const content = '# Heading\n\nSome text without links.\n';
    expect(rewriteMarkdownPaths(content, 'commit/SKILL.md', skillsPrefix)).toBe(content);
  });

  it('handles mixed link types in the same line', () => {
    const content = 'See [local](../_data/file.md) and [remote](https://example.com) and [abs](/path.md).';
    const expected =
      'See [local](~/.claude/skills/_data/file.md) and [remote](https://example.com) and [abs](/path.md).';
    expect(rewriteMarkdownPaths(content, 'commit/SKILL.md', skillsPrefix)).toBe(expected);
  });
});

describe(rewritePathsInDirectory, () => {
  let tempDir: string;
  let skillsDestDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `path-rewriter-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    skillsDestDir = path.join(tempDir, 'skills');
    await mkdir(skillsDestDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('rewrites relative links in .md files within a directory', async () => {
    const skillDir = path.join(skillsDestDir, 'commit');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), 'See [format](../_data/commit-format.md) for spec.', 'utf8');

    await rewritePathsInDirectory(skillDir, skillsDestDir, '.claude/skills');

    const result = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    expect(result).toBe('See [format](~/.claude/skills/_data/commit-format.md) for spec.');
  });

  it('recursively processes nested directories', async () => {
    const nestedDir = path.join(skillsDestDir, 'orchestrate', 'modules');
    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      path.join(nestedDir, 'review-cycle.md'),
      'See [conventions](../../_data/artifact-conventions.md) for details.',
      'utf8',
    );

    await rewritePathsInDirectory(path.join(skillsDestDir, 'orchestrate'), skillsDestDir, '.claude/skills');

    const result = await readFile(path.join(nestedDir, 'review-cycle.md'), 'utf8');
    expect(result).toBe('See [conventions](~/.claude/skills/_data/artifact-conventions.md) for details.');
  });

  it('skips non-.md files', async () => {
    const skillDir = path.join(skillsDestDir, 'test-skill');
    await mkdir(skillDir, { recursive: true });
    const originalContent = 'See [format](../_data/commit-format.md) for spec.';
    await writeFile(path.join(skillDir, 'notes.txt'), originalContent, 'utf8');

    await rewritePathsInDirectory(skillDir, skillsDestDir, '.claude/skills');

    const result = await readFile(path.join(skillDir, 'notes.txt'), 'utf8');
    expect(result).toBe(originalContent);
  });

  it('handles an empty directory without error', async () => {
    const skillDir = path.join(skillsDestDir, 'empty-skill');
    await mkdir(skillDir, { recursive: true });

    await expect(rewritePathsInDirectory(skillDir, skillsDestDir, '.claude/skills')).resolves.toBeUndefined();
  });

  it('does not write files when no changes are needed', async () => {
    const skillDir = path.join(skillsDestDir, 'test-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '# No links here\n', 'utf8');

    await rewritePathsInDirectory(skillDir, skillsDestDir, '.claude/skills');

    const result = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    expect(result).toBe('# No links here\n');
  });
});
