import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultKbConfig, type KbConfig } from '../../config/config-schema.ts';
import { makeTree } from '../../test-utils/index.ts';
import { enumerateNotes } from '../enumerate.ts';

/** Directories whose `readdir` should reject; cleared between tests. */
const unreadableDirs = new Set<string>();

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readdir: (path: Parameters<typeof actual.readdir>[0], options: Parameters<typeof actual.readdir>[1]) => {
      if (typeof path === 'string' && unreadableDirs.has(path)) {
        return Promise.reject(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }));
      }
      return actual.readdir(path, options);
    },
  };
});

afterEach(() => {
  unreadableDirs.clear();
  vi.restoreAllMocks();
});

const VALID =
  '---\ntitle: A\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

/** Enumerates `root` under a config, defaulting `exclude` to the bundled default. */
async function enumerateIn(root: string, config: Partial<KbConfig> & Pick<KbConfig, 'targets'>): Promise<string[]> {
  const notes = await enumerateNotes({
    kbRoot: root,
    config: { targets: config.targets, exclude: config.exclude ?? defaultKbConfig.exclude },
  });
  return notes.map((entry) => entry.relativePath).toSorted();
}

describe(enumerateNotes, () => {
  it('enumerates only notes under content/ for the default targets', async () => {
    const root = await makeTree({
      'content/top.md': VALID,
      'content/sub/nested.md': VALID,
      'outside.md': VALID,
      'drafts/elsewhere.md': VALID,
    });

    expect(await enumerateIn(root, defaultKbConfig)).toEqual(['content/sub/nested.md', 'content/top.md']);
  });

  it('excludes node_modules even when nested under a target directory', async () => {
    const root = await makeTree({
      'content/kept.md': VALID,
      'content/node_modules/dep/readme.md': VALID,
    });

    expect(await enumerateIn(root, defaultKbConfig)).toEqual(['content/kept.md']);
  });

  it('excludes dot-directories implicitly via dot:false without naming them', async () => {
    const root = await makeTree({
      'content/kept.md': VALID,
      'content/.git/hook.md': VALID,
      'content/.kb/note.md': VALID,
    });

    expect(await enumerateIn(root, defaultKbConfig)).toEqual(['content/kept.md']);
  });

  it('enumerates the whole tree for a glob-first target with no leading literal', async () => {
    const root = await makeTree({
      'top.md': VALID,
      'sub/nested.md': VALID,
      '2026-05-29/dated.md': VALID,
    });

    expect(await enumerateIn(root, { targets: ['**/*.md'] })).toEqual([
      '2026-05-29/dated.md',
      'sub/nested.md',
      'top.md',
    ]);
  });

  it('still excludes node_modules under a full-walk glob-first target', async () => {
    const root = await makeTree({
      'top.md': VALID,
      'node_modules/dep/readme.md': VALID,
    });

    expect(await enumerateIn(root, { targets: ['**/*.md'] })).toEqual(['top.md']);
  });

  it('keeps a note with malformed frontmatter rather than dropping it', async () => {
    const root = await makeTree({ 'content/broken.md': '---\ntitle: [unterminated\n---\n\nBody.\n' });

    const notes = await enumerateNotes({ kbRoot: root, config: defaultKbConfig });

    expect(notes).toHaveLength(1);
    expect(notes[0]?.note.frontmatter).toBeNull();
    expect(notes[0]?.relativePath).toBe('content/broken.md');
  });

  it('ignores non-markdown files', async () => {
    const root = await makeTree({ 'content/note.md': VALID, 'content/data.json': '{}', 'content/image.png': 'x' });

    expect(await enumerateIn(root, defaultKbConfig)).toEqual(['content/note.md']);
  });

  it('honors an explicit exclude target glob', async () => {
    const root = await makeTree({
      'content/keep.md': VALID,
      'content/drafts/skip.md': VALID,
    });

    expect(await enumerateIn(root, { targets: ['content/**/*.md'], exclude: ['**/drafts/**'] })).toEqual([
      'content/keep.md',
    ]);
  });

  it('skips an unreadable subdirectory and still returns the readable notes', async () => {
    const root = await makeTree({ 'content/top.md': VALID, 'content/restricted/inside.md': VALID });
    const blockedDir = join(root, 'content', 'restricted');
    unreadableDirs.add(blockedDir);
    const warnings: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      warnings.push(String(chunk));
      return true;
    });

    const notes = await enumerateNotes({ kbRoot: root, config: defaultKbConfig });

    expect(notes.map((entry) => entry.relativePath)).toEqual(['content/top.md']);
    expect(warnings.join('')).toContain(`kb: warning: could not read directory ${blockedDir}`);
  });
});
