import assert from 'node:assert/strict';
import { realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { commitAll, initGitRepo, runGitInFixture } from '../../test-utils/git-repo.ts';
import { makeTempDir } from '../../test-utils/make-temp-dir.ts';
import { makeTree } from '../../test-utils/make-tree.ts';
import { realGit } from '../git.ts';

/** `Cafe.md` with a combining acute after the `e`: the decomposed form that macOS returns from `readdir`. */
const DECOMPOSED_NAME = 'Cafe\u{301}.md';

describe('realGit', () => {
  describe('findMergeBase', () => {
    it('returns the commit shared by the ref and HEAD', async () => {
      const root = await makeTree({ 'content/Keep.md': 'x\n' });
      initGitRepo(root);
      const base = commitAll(root, 'base');
      await writeFile(join(root, 'content', 'Added.md'), 'x\n', 'utf8');
      commitAll(root, 'add a note');

      expect(realGit.findMergeBase({ cwd: root, ref: base })).toStrictEqual({ ok: true, value: base });
    });

    it('fails with git message for an unknown ref', async () => {
      const root = await makeTree({ 'content/Keep.md': 'x\n' });
      initGitRepo(root);
      commitAll(root, 'base');

      const answer = realGit.findMergeBase({ cwd: root, ref: 'no-such-ref' });

      assert.ok(!answer.ok);
      expect(answer.message).toContain('no-such-ref');
    });
  });

  describe('findTopLevel', () => {
    it('returns the real path of the working tree root from a nested directory', async () => {
      const repo = await makeTree({ 'store/content/Keep.md': 'x\n' });
      initGitRepo(repo);

      expect(realGit.findTopLevel({ cwd: join(repo, 'store') })).toStrictEqual({
        ok: true,
        value: await realpath(repo),
      });
    });

    it('fails outside a git working tree', async () => {
      const root = await makeTempDir('kb-no-repo-');

      expect(realGit.findTopLevel({ cwd: root }).ok).toBe(false);
    });
  });

  describe('listChangedFiles', () => {
    it('lists files added since the base and uncommitted edits to tracked files', async () => {
      const root = await makeTree({ 'content/Keep.md': 'x\n' });
      initGitRepo(root);
      const base = commitAll(root, 'base');
      await writeFile(join(root, 'content', 'Added.md'), 'x\n', 'utf8');
      commitAll(root, 'add a note');
      await writeFile(join(root, 'content', 'Keep.md'), 'x\nlocal edit\n', 'utf8');

      const answer = realGit.listChangedFiles({ cwd: root, base });

      assert.ok(answer.ok);
      expect(answer.value.toSorted()).toStrictEqual(['content/Added.md', 'content/Keep.md']);
    });

    it('reports a rename at its destination', async () => {
      const root = await makeTree({ 'content/Old.md': 'x\n' });
      initGitRepo(root);
      const base = commitAll(root, 'base');
      runGitInFixture(root, 'mv', 'content/Old.md', 'content/New.md');

      expect(realGit.listChangedFiles({ cwd: root, base })).toStrictEqual({ ok: true, value: ['content/New.md'] });
    });

    it('excludes a deleted file', async () => {
      const root = await makeTree({ 'content/Keep.md': 'x\n', 'content/Remove.md': 'x\n' });
      initGitRepo(root);
      const base = commitAll(root, 'base');
      runGitInFixture(root, 'rm', '--quiet', 'content/Remove.md');

      expect(realGit.listChangedFiles({ cwd: root, base })).toStrictEqual({ ok: true, value: [] });
    });

    it('keeps a non-ASCII path verbatim', async () => {
      const root = await makeTree({ 'content/Keep.md': 'x\n' });
      initGitRepo(root);
      const base = commitAll(root, 'base');
      await writeFile(join(root, 'content', 'Café.md'), 'x\n', 'utf8');
      commitAll(root, 'add a non-ascii note');

      const answer = realGit.listChangedFiles({ cwd: root, base });

      assert.ok(answer.ok);
      expect(answer.value.map((path) => path.normalize('NFC'))).toStrictEqual(['content/Café.md'.normalize('NFC')]);
    });

    it('limits the listing to a nested directory, reporting paths relative to the repository root', async () => {
      const repo = await makeTree({ 'store/content/Keep.md': 'x\n', 'outside.md': 'x\n' });
      initGitRepo(repo);
      const base = commitAll(repo, 'base');
      await writeFile(join(repo, 'store', 'content', 'Added.md'), 'x\n', 'utf8');
      await writeFile(join(repo, 'outside.md'), 'changed\n', 'utf8');
      commitAll(repo, 'change inside and outside the store');

      expect(realGit.listChangedFiles({ cwd: join(repo, 'store'), base })).toStrictEqual({
        ok: true,
        value: ['store/content/Added.md'],
      });
    });

    it('fails for an unknown base', async () => {
      const root = await makeTree({ 'content/Keep.md': 'x\n' });
      initGitRepo(root);
      commitAll(root, 'base');

      expect(realGit.listChangedFiles({ cwd: root, base: 'no-such-ref' }).ok).toBe(false);
    });
  });

  describe('listScope', () => {
    it('includes tracked files and untracked files not ignored by any rule', async () => {
      const root = await makeTree({ 'content/Tracked.md': 'x\n' });
      initGitRepo(root);
      commitAll(root, 'base');
      await writeFile(join(root, 'content', 'Untracked.md'), 'x\n', 'utf8');

      const scope = realGit.listScope({ root });

      expect(scope?.has('content/Tracked.md')).toBe(true);
      expect(scope?.has('content/Untracked.md')).toBe(true);
    });

    it('omits an untracked file that an ignore rule covers', async () => {
      const root = await makeTree({
        '.gitignore': 'local/\n*.local.md\n',
        'content/Kept.md': 'x\n',
        'content/local/Scratch.md': 'x\n',
        'content/Draft.local.md': 'x\n',
      });
      initGitRepo(root);
      commitAll(root, 'base');

      const scope = realGit.listScope({ root });

      expect(scope?.has('content/Kept.md')).toBe(true);
      expect(scope?.has('content/local/Scratch.md')).toBe(false);
      expect(scope?.has('content/Draft.local.md')).toBe(false);
    });

    it('keeps a tracked file that an ignore rule matches, since every clone still contains it', async () => {
      const root = await makeTree({ 'content/Draft.local.md': 'x\n' });
      initGitRepo(root);
      commitAll(root, 'track the note before it is ignored');
      await writeFile(join(root, '.gitignore'), '*.local.md\n', 'utf8');
      commitAll(root, 'ignore the pattern');

      expect(realGit.listScope({ root })?.has('content/Draft.local.md')).toBe(true);
    });

    it('reports a decomposed name in composed form', async () => {
      const root = await makeTree({ [`content/${DECOMPOSED_NAME}`]: 'x\n' });
      initGitRepo(root);
      commitAll(root, 'base');

      expect(realGit.listScope({ root })?.has(`content/${DECOMPOSED_NAME}`.normalize('NFC'))).toBe(true);
    });

    it('returns root-relative paths for a root nested below the repository root', async () => {
      const repo = await makeTree({ 'store/content/Kept.md': 'x\n', 'outside.md': 'x\n' });
      initGitRepo(repo);
      commitAll(repo, 'base');

      const scope = realGit.listScope({ root: join(repo, 'store') });

      expect(scope?.has('content/Kept.md')).toBe(true);
      expect(scope?.has('store/content/Kept.md')).toBe(false);
      expect(scope?.has('outside.md')).toBe(false);
    });

    it('returns undefined outside a git working tree', async () => {
      const root = await makeTempDir('kb-no-repo-');

      expect(realGit.listScope({ root })).toBeUndefined();
    });
  });
});
