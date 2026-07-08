import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { KbLoaderError } from '../../config/kb-loader-error.ts';
import { makeStore } from '../../test-utils/scaffolding.ts';
import { check } from '../check.ts';

const VALID =
  '---\ntitle: A\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

describe(check, () => {
  it('returns both enumerated notes and findings for a content-scoped store', async () => {
    const root = await makeStore({
      'content/Clean.md': VALID,
      'content/Bad.md':
        '---\ntitle: Bad\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nSee [[Nonexistent]].\n',
    });

    const result = await check({ kbRoot: root });

    expect(result.notes.map((entry) => entry.relativePath).toSorted()).toEqual(['content/Bad.md', 'content/Clean.md']);
    expect(result.findings.map((finding) => finding.rule)).toContain('wikilinks.unresolved');
    expect(result.config.targets).toEqual(['content/**/*.md']);
  });

  it('performs no frontmatter validation, even for an incomplete note', async () => {
    const root = await makeStore({
      'content/Incomplete.md': '---\ntitle: Bad\nrecordType: assertion\ncreated: 2026-05-01\ntags: [x]\n---\n\nBody.\n',
    });

    const result = await check({ kbRoot: root });

    expect(result.findings.every((finding) => !finding.rule.startsWith('frontmatter.'))).toBe(true);
  });

  it('honors a config.yaml targets override beyond the content/ default', async () => {
    const root = await makeStore({
      'notes/Top.md': VALID,
      'content/Ignored.md': VALID,
    });
    await writeFile(join(root, '.kb', 'config.yaml'), 'targets:\n  - "notes/**/*.md"\n', 'utf8');

    const result = await check({ kbRoot: root });

    expect(result.notes.map((entry) => entry.relativePath)).toEqual(['notes/Top.md']);
    expect(result.config.targets).toEqual(['notes/**/*.md']);
  });

  it('runs the tag-alias lint using the store aliases', async () => {
    const aliased = VALID.replace('tags: [x]', 'tags: [vcs]');
    const root = await makeStore({ 'content/Aliased.md': aliased });
    await writeFile(join(root, '.kb', 'tag-aliases.yaml'), 'aliases:\n  git: [vcs]\n', 'utf8');

    const result = await check({ kbRoot: root });

    expect(result.findings.map((finding) => finding.rule)).toContain('tag-alias');
  });

  it('reports a basename collision once as a warning', async () => {
    const root = await makeStore({
      'content/Foo.md': VALID,
      'content/sub/Foo.md': VALID,
    });

    const result = await check({ kbRoot: root });

    const collisions = result.findings.filter((finding) => finding.rule === 'wikilinks.basename');
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.severity).toBe('warning');
  });

  it('flags a hardcoded home path via the paths lint', async () => {
    const root = await makeStore({ 'content/Path.md': VALID.replace('Body.', 'Run /Users/bob/tool now.') });

    const result = await check({ kbRoot: root });

    expect(result.findings.map((finding) => finding.rule)).toContain('paths.user-home');
  });

  it('propagates a KbLoaderError when config.yaml is malformed', async () => {
    const root = await makeStore({ 'content/Note.md': VALID });
    await writeFile(join(root, '.kb', 'config.yaml'), 'targets: [unterminated\n', 'utf8');

    await expect(check({ kbRoot: root })).rejects.toBeInstanceOf(KbLoaderError);
  });

  it('matches a full-tree walk on an all-content fixture', async () => {
    const root = await makeStore({
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
