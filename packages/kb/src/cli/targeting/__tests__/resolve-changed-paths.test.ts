import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { commitAll, initGitRepo, makeStore, runGit } from '../../../test-utils/scaffolding.ts';
import { resolveChangedPaths } from '../resolve-changed-paths.ts';

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
});
