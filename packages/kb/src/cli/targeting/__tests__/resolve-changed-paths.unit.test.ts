import assert from 'node:assert/strict';
import { mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { makeFakeGit } from '../../../test-utils/make-fake-git.ts';
import { makeTempDir } from '../../../test-utils/make-temp-dir.ts';
import { resolveChangedPaths } from '../resolve-changed-paths.ts';

describe(resolveChangedPaths, () => {
  it('returns the changed files relative to a store at the repository root', async () => {
    const root = await makeTempDir('kb-changed-');
    const git = makeFakeGit({
      findMergeBase: { ok: true, value: 'base' },
      findTopLevel: { ok: true, value: await realpath(root) },
      listChangedFiles: { ok: true, value: ['content/Added.md', 'content/Café.md'] },
    });

    const result = resolveChangedPaths({ storeRoot: root, ref: 'main', git });

    assert.ok(result.ok);
    expect(result.paths).toStrictEqual(['content/Added.md', 'content/Café.md']);
  });

  it('rebases repository-relative paths onto a store nested below the repository root', async () => {
    const repo = await makeTempDir('kb-nested-');
    const storeRoot = join(repo, 'store');
    await mkdir(storeRoot);
    const git = makeFakeGit({
      findMergeBase: { ok: true, value: 'base' },
      findTopLevel: { ok: true, value: await realpath(repo) },
      listChangedFiles: { ok: true, value: ['store/content/Added.md'] },
    });

    const result = resolveChangedPaths({ storeRoot, ref: 'main', git });

    assert.ok(result.ok);
    expect(result.paths).toStrictEqual(['content/Added.md']);
  });

  it('returns a failure naming the ref when the ref cannot be resolved', async () => {
    const root = await makeTempDir('kb-changed-');
    const git = makeFakeGit({ findMergeBase: { ok: false, message: 'fatal: Not a valid object name' } });

    const result = resolveChangedPaths({ storeRoot: root, ref: 'no-such-ref', git });

    assert.ok(!result.ok);
    expect(result.message).toContain('no-such-ref');
    expect(result.message).toContain('fatal: Not a valid object name');
  });

  it("returns git's failure when the diff cannot be listed", async () => {
    const root = await makeTempDir('kb-changed-');
    const git = makeFakeGit({
      findMergeBase: { ok: true, value: 'base' },
      findTopLevel: { ok: true, value: await realpath(root) },
      listChangedFiles: { ok: false, message: 'fatal: bad object base' },
    });

    expect(resolveChangedPaths({ storeRoot: root, ref: 'main', git })).toStrictEqual({
      ok: false,
      message: 'fatal: bad object base',
    });
  });
});
