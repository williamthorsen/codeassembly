import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultKbConfig } from '../../config/config-schema.ts';
import { commitAll, initGitRepo } from '../../test-utils/git-repo.ts';
import { makeTree } from '../../test-utils/make-tree.ts';
import { enumerateNotePaths } from '../enumerate.ts';

/** `Cafe.md` with a combining acute after the `e`: the decomposed form macOS returns from `readdir`. */
const DECOMPOSED_NAME = 'Cafe\u{301}.md';

const VALID =
  '---\ntitle: A\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

afterEach(() => {
  vi.restoreAllMocks();
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
