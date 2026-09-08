import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultKbConfig, type KbConfig } from '../../config/config-schema.ts';
import { commitAll, initGitRepo } from '../../test-utils/git-repo.ts';
import { makeTree } from '../../test-utils/make-tree.ts';
import { enumerateNotePaths, enumerateNotes } from '../enumerate.ts';

/** `Cafe.md` with a combining acute after the `e`: the decomposed form macOS returns from `readdir`. */
const DECOMPOSED_NAME = 'Cafe\u{301}.md';

/** Every path `readFile` was called with, so a paths-only enumeration can be shown to open nothing. */
const readFilePaths: string[] = [];

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
    readFile: (path: Parameters<typeof actual.readFile>[0], options: Parameters<typeof actual.readFile>[1]) => {
      if (typeof path === 'string') {
        readFilePaths.push(path);
      }
      return actual.readFile(path, options);
    },
  };
});

afterEach(() => {
  readFilePaths.length = 0;
  unreadableDirs.clear();
  vi.restoreAllMocks();
});

const VALID =
  '---\ntitle: A\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

describe(enumerateNotePaths, () => {
  it('returns the same note set enumerateNotes selects, under the same targets and excludes', async () => {
    const root = await makeTree({
      'content/top.md': VALID,
      'content/sub/nested.md': VALID,
      'content/drafts/skip.md': VALID,
      'outside.md': VALID,
    });
    const config: KbConfig = { ...defaultKbConfig, targets: ['content/**/*.md'], exclude: ['**/drafts/**'] };

    const paths = await enumerateNotePaths({ kbRoot: root, config });

    expect(paths.toSorted()).toEqual(['content/sub/nested.md', 'content/top.md']);
    expect(paths.toSorted()).toEqual(await enumerateIn(root, config));
  });

  it('opens no note file', async () => {
    const root = await makeTree({ 'content/top.md': VALID, 'content/sub/nested.md': VALID });

    await enumerateNotePaths({ kbRoot: root, config: defaultKbConfig });

    expect(readFilePaths).toEqual([]);
  });
});

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
    expect(notes[0]?.error).toBeDefined();
    expect(notes[0]?.fields).toEqual({});
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

describe(`${enumerateNotePaths.name} under git`, () => {
  it('omits a note that the repository ignores', async () => {
    const root = await makeTree({
      '.gitignore': 'local/\n*.local.md\n',
      'content/Kept.md': VALID,
      'content/local/Scratch.md': VALID,
      'content/Draft.local.md': VALID,
    });
    initGitRepo(root);
    commitAll(root, 'base');

    const paths = await enumerateNotePaths({ kbRoot: root, config: defaultKbConfig });

    expect(paths).toEqual(['content/Kept.md']);
  });

  it('keeps an untracked note that no ignore rule covers', async () => {
    const root = await makeTree({ 'content/Tracked.md': VALID });
    initGitRepo(root);
    commitAll(root, 'base');
    await writeFile(join(root, 'content', 'Untracked.md'), VALID, 'utf8');

    const paths = await enumerateNotePaths({ kbRoot: root, config: defaultKbConfig });

    expect(paths.toSorted()).toEqual(['content/Tracked.md', 'content/Untracked.md']);
  });

  it('enumerates a note whose on-disk name is decomposed, which git reports composed', async () => {
    const root = await makeTree({ [`content/${DECOMPOSED_NAME}`]: VALID });
    initGitRepo(root);
    commitAll(root, 'base');

    const paths = await enumerateNotePaths({ kbRoot: root, config: defaultKbConfig });

    expect(paths.map((path) => path.normalize('NFC'))).toEqual([`content/${DECOMPOSED_NAME}`.normalize('NFC')]);
  });

  it('warns when git ignores every note that the walk found', async () => {
    const root = await makeTree({ '.gitignore': 'content/\n', 'content/Scratch.md': VALID });
    initGitRepo(root);
    commitAll(root, 'base');
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const paths = await enumerateNotePaths({ kbRoot: root, config: defaultKbConfig });

    expect(paths).toEqual([]);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('git ignores every note'));
  });

  it('keeps every note under a directory that is not a git working tree', async () => {
    const root = await makeTree({ '.gitignore': 'content/\n', 'content/Scratch.md': VALID });

    const paths = await enumerateNotePaths({ kbRoot: root, config: defaultKbConfig });

    expect(paths).toEqual(['content/Scratch.md']);
  });
});

// region | Helpers

/** Enumerates `root` under a config, inheriting the bundled defaults for every field the caller omits. */
async function enumerateIn(root: string, config: Partial<KbConfig> & Pick<KbConfig, 'targets'>): Promise<string[]> {
  const notes = await enumerateNotes({ kbRoot: root, config: { ...defaultKbConfig, ...config } });
  return notes.map((entry) => entry.relativePath).toSorted();
}

// endregion | Helpers
