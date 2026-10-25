import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { makeTempDir } from '../../test-utils/make-temp-dir.ts';
import { makeRegistryPath } from '../../test-utils/registry.ts';
import { create } from '../create.ts';

// Forces the registry writer to report a name collision detected at write time, a TOCTOU race that the pre-flight
// check of the registry in `create` cannot catch, so that the test can pin how `create` reconciles the two layers
// guarding the same invariant.
vi.mock('../../discovery/register-store.ts', () => ({
  registerStore: vi.fn(() => Promise.resolve({ status: 'already-present' })),
}));

describe('create with a write-time registry collision', () => {
  it('returns a name-registered failure when registerStore reports already-present', async () => {
    const targetDir = await makeTempDir('kb-create-race-');
    const registryPath = await makeRegistryPath();

    const outcome = await create({ targetDir, register: true, registryPath });

    assert.ok(!outcome.ok);
    expect(outcome.reason).toBe('name-registered');
  });

  it('leaves an empty target directory empty', async () => {
    const targetDir = await makeTempDir('kb-create-race-');
    const registryPath = await makeRegistryPath();

    await create({ targetDir, register: true, registryPath });

    expect(await readdir(targetDir)).toEqual([]);
  });

  it('keeps content that was in the target directory before the call', async () => {
    const targetDir = await makeTempDir('kb-create-race-');
    const registryPath = await makeRegistryPath();
    await mkdir(join(targetDir, 'content'));
    await writeFile(join(targetDir, 'content', 'note.md'), '# Note\n');

    await create({ targetDir, register: true, registryPath });

    expect(await readdir(targetDir)).toEqual(['content']);
    expect(await readdir(join(targetDir, 'content'))).toEqual(['note.md']);
    expect(await readFile(join(targetDir, 'content', 'note.md'), 'utf8')).toBe('# Note\n');
  });
});
