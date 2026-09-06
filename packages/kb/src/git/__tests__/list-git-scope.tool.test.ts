import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { commitAll, initGitRepo } from '../../test-utils/git-repo.ts';
import { makeTempDir } from '../../test-utils/make-temp-dir.ts';
import { makeTree } from '../../test-utils/make-tree.ts';
import { listGitScope } from '../list-git-scope.ts';

/** `Cafe.md` with a combining acute after the `e`: the decomposed form macOS returns from `readdir`. */
const DECOMPOSED_NAME = 'Cafe\u{301}.md';

describe(listGitScope, () => {
  it('includes tracked notes and untracked notes that no rule ignores', async () => {
    const root = await makeTree({ 'content/Tracked.md': 'x\n' });
    initGitRepo(root);
    commitAll(root, 'base');
    await writeFile(join(root, 'content', 'Untracked.md'), 'x\n', 'utf8');

    const scope = listGitScope({ root });

    expect(scope?.has('content/Tracked.md')).toBe(true);
    expect(scope?.has('content/Untracked.md')).toBe(true);
  });

  it('omits an untracked note that an ignore rule covers', async () => {
    const root = await makeTree({
      '.gitignore': 'local/\n*.local.md\n',
      'content/Kept.md': 'x\n',
      'content/local/Scratch.md': 'x\n',
      'content/Draft.local.md': 'x\n',
    });
    initGitRepo(root);
    commitAll(root, 'base');

    const scope = listGitScope({ root });

    expect(scope?.has('content/Kept.md')).toBe(true);
    expect(scope?.has('content/local/Scratch.md')).toBe(false);
    expect(scope?.has('content/Draft.local.md')).toBe(false);
  });

  it('keeps a tracked note that an ignore rule matches, since every clone still sees it', async () => {
    const root = await makeTree({ 'content/Draft.local.md': 'x\n' });
    initGitRepo(root);
    commitAll(root, 'track the note before it is ignored');
    await writeFile(join(root, '.gitignore'), '*.local.md\n', 'utf8');
    commitAll(root, 'ignore the pattern');

    const scope = listGitScope({ root });

    expect(scope?.has('content/Draft.local.md')).toBe(true);
  });

  it('normalizes a decomposed name to the composed form the walk is compared against', async () => {
    const root = await makeTree({ [`content/${DECOMPOSED_NAME}`]: 'x\n' });
    initGitRepo(root);
    commitAll(root, 'base');

    const scope = listGitScope({ root });

    expect(scope?.has(`content/${DECOMPOSED_NAME}`.normalize('NFC'))).toBe(true);
  });

  it('returns store-relative paths for a store nested below the repository root', async () => {
    const repo = await makeTree({ 'store/content/Kept.md': 'x\n', 'outside.md': 'x\n' });
    initGitRepo(repo);
    commitAll(repo, 'base');

    const scope = listGitScope({ root: join(repo, 'store') });

    expect(scope?.has('content/Kept.md')).toBe(true);
    expect(scope?.has('store/content/Kept.md')).toBe(false);
    expect(scope?.has('outside.md')).toBe(false);
  });

  it('returns undefined outside a git working tree', async () => {
    const root = await makeTempDir('kb-no-repo-');

    expect(listGitScope({ root })).toBeUndefined();
  });
});
