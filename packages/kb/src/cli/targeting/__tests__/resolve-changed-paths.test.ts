import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { commitAll, initGitRepo, makeStore, makeTempDir, runGit } from '../../../test-utils/scaffolding.ts';
import { resolveChangedPaths } from '../resolve-changed-paths.ts';

/** Writes `content` to `root/rel`, creating parent directories first. */
async function writeAt(root: string, rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, 'utf8');
}

const NOTE =
  '---\ntitle: A\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

describe(resolveChangedPaths, () => {
  it('reports notes added since the ref and uncommitted edits to tracked notes', async () => {
    const root = await makeStore({ 'content/Keep.md': NOTE });
    initGitRepo(root);
    const base = commitAll(root, 'base');

    await writeFile(join(root, 'content', 'Added.md'), NOTE, 'utf8');
    commitAll(root, 'add a note');
    await writeFile(join(root, 'content', 'Keep.md'), `${NOTE}\nlocal edit\n`, 'utf8');

    const result = resolveChangedPaths({ storeRoot: root, ref: base });

    assert.ok(result.ok);
    expect(result.paths.toSorted()).toEqual(['content/Added.md', 'content/Keep.md']);
  });

  it('reports the destination of an uncommitted rename and omits the source', async () => {
    const root = await makeStore({ 'content/Old.md': NOTE });
    initGitRepo(root);
    const base = commitAll(root, 'base');

    runGit(root, 'mv', 'content/Old.md', 'content/New.md');

    const result = resolveChangedPaths({ storeRoot: root, ref: base });

    assert.ok(result.ok);
    expect(result.paths).toEqual(['content/New.md']);
  });

  it('excludes a deleted note', async () => {
    const root = await makeStore({ 'content/Keep.md': NOTE, 'content/Remove.md': NOTE });
    initGitRepo(root);
    const base = commitAll(root, 'base');

    runGit(root, 'rm', '--quiet', 'content/Remove.md');

    const result = resolveChangedPaths({ storeRoot: root, ref: base });

    assert.ok(result.ok);
    expect(result.paths).toEqual([]);
  });

  it('returns a failure naming the ref when the ref cannot be resolved', async () => {
    const root = await makeStore({ 'content/Keep.md': NOTE });
    initGitRepo(root);
    commitAll(root, 'base');

    const result = resolveChangedPaths({ storeRoot: root, ref: 'no-such-ref' });

    assert.ok(!result.ok);
    expect(result.message).toContain('no-such-ref');
  });

  it('resolves a changed note with a non-ASCII name to its real path', async () => {
    const root = await makeStore({ 'content/Keep.md': NOTE });
    initGitRepo(root);
    const base = commitAll(root, 'base');

    await writeFile(join(root, 'content', 'Café.md'), NOTE, 'utf8');
    commitAll(root, 'add a non-ascii note');

    const result = resolveChangedPaths({ storeRoot: root, ref: base });

    assert.ok(result.ok);
    expect(result.paths).toContain('content/Café.md');
  });

  it('limits changed paths to the store subtree when the store is nested below the git root', async () => {
    const repo = await makeTempDir('kb-nested-');
    initGitRepo(repo);
    await writeAt(repo, 'store/content/Keep.md', NOTE);
    await writeAt(repo, 'outside.md', 'x');
    const base = commitAll(repo, 'base');

    await writeAt(repo, 'store/content/Added.md', NOTE);
    await writeAt(repo, 'outside.md', 'changed');
    commitAll(repo, 'change inside and outside the store');

    const result = resolveChangedPaths({ storeRoot: join(repo, 'store'), ref: base });

    assert.ok(result.ok);
    expect(result.paths).toEqual(['content/Added.md']);
  });
});
