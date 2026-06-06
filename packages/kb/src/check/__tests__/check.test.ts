import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { KbLoaderError } from '../../config/kb-loader-error.ts';
import { check } from '../check.ts';

const VALID = '---\ntitle: A\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

/** Stands up a temp KB root with a `.kb/` and the given files, returning its path. */
async function makeVault(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kb-check-'));
  await mkdir(join(root, '.kb'), { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const full = join(root, relativePath);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return root;
}

describe(check, () => {
  it('returns both enumerated notes and findings for a content-scoped store', async () => {
    const root = await makeVault({
      'content/Clean.md': VALID,
      'content/Bad.md': '---\ntitle: Bad\ntype: howto\ncreated: 2026-05-01\ntags: [x]\n---\n\nMissing updated.\n',
    });

    const result = await check({ kbRoot: root });

    expect(result.notes.map((entry) => entry.relativePath).toSorted()).toEqual(['content/Bad.md', 'content/Clean.md']);
    expect(result.findings.map((finding) => finding.rule)).toContain('frontmatter.required');
    expect(result.config.targets).toEqual(['content/**/*.md']);
  });

  it('honors a config.yaml targets override beyond the content/ default', async () => {
    const root = await makeVault({
      'notes/Top.md': VALID,
      'content/Ignored.md': VALID,
    });
    await writeFile(join(root, '.kb', 'config.yaml'), 'targets:\n  - "notes/**/*.md"\n', 'utf8');

    const result = await check({ kbRoot: root });

    expect(result.notes.map((entry) => entry.relativePath)).toEqual(['notes/Top.md']);
    expect(result.config.targets).toEqual(['notes/**/*.md']);
  });

  it('runs the tag-alias rule using the store aliases', async () => {
    const aliased = VALID.replace('tags: [x]', 'tags: [vcs]');
    const root = await makeVault({ 'content/Aliased.md': aliased });
    await writeFile(join(root, '.kb', 'tag-aliases.yaml'), 'aliases:\n  git: [vcs]\n', 'utf8');

    const result = await check({ kbRoot: root });

    expect(result.findings.map((finding) => finding.rule)).toContain('frontmatter.tag-alias');
  });

  it('propagates a KbLoaderError when config.yaml is malformed', async () => {
    const root = await makeVault({ 'content/Note.md': VALID });
    await writeFile(join(root, '.kb', 'config.yaml'), 'targets: [unterminated\n', 'utf8');

    await expect(check({ kbRoot: root })).rejects.toBeInstanceOf(KbLoaderError);
  });

  it('propagates a KbLoaderError when schema.yaml is malformed', async () => {
    const root = await makeVault({ 'content/Note.md': VALID });
    await writeFile(join(root, '.kb', 'schema.yaml'), 'types: [howto\n', 'utf8');

    await expect(check({ kbRoot: root })).rejects.toBeInstanceOf(KbLoaderError);
  });

  it('matches a full-tree walk on an all-content fixture', async () => {
    const root = await makeVault({
      'content/Top.md': VALID,
      'content/sub/Nested.md': VALID,
      'content/2026-05-29/Dated.md': VALID,
    });

    const result = await check({ kbRoot: root });

    expect(result.notes.map((entry) => entry.relativePath).toSorted()).toEqual([
      'content/2026-05-29/Dated.md',
      'content/Top.md',
      'content/sub/Nested.md',
    ]);
  });
});
