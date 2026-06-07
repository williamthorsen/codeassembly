import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadKbRegistry } from '../../discovery/load-registry.ts';
import { create } from '../create.ts';

describe(create, () => {
  it('scaffolds the .kb seed files and the content directories', async () => {
    const targetDir = await makeTempDir('kb-create-store-');
    const registryPath = await makeRegistryPath();

    const outcome = await create({ targetDir, register: true, registryPath });

    assert.ok(outcome.ok);
    expect(await exists(join(targetDir, '.kb', 'schema.yaml'))).toBe(true);
    expect(await exists(join(targetDir, '.kb', 'config.yaml'))).toBe(true);
    expect(await exists(join(targetDir, '.kb', 'tag-aliases.yaml'))).toBe(true);
    expect(await exists(join(targetDir, 'content', 'events'))).toBe(true);
  });

  it('registers the store under its directory name by default', async () => {
    const targetDir = await makeTempDir('kb-create-store-');
    const registryPath = await makeRegistryPath();

    const outcome = await create({ targetDir, register: true, registryPath });

    assert.ok(outcome.ok);
    expect(outcome.created.registered).toBe(true);
    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.entries).toHaveLength(1);
    expect(config.entries[0]?.name).toBe(basename(targetDir));
    expect(config.entries[0]?.path).toBe(targetDir);
  });

  it('registers under the provided name when --name is given', async () => {
    const targetDir = await makeTempDir('kb-create-store-');
    const registryPath = await makeRegistryPath();

    await create({ targetDir, name: 'custom', register: true, registryPath });

    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.entries[0]?.name).toBe('custom');
  });

  it('skips registration when register is false', async () => {
    const targetDir = await makeTempDir('kb-create-store-');

    const outcome = await create({ targetDir, register: false });

    assert.ok(outcome.ok);
    expect(outcome.created.registered).toBe(false);
    expect(await exists(join(targetDir, '.kb', 'schema.yaml'))).toBe(true);
  });

  it('returns kb-exists and scaffolds nothing when .kb already exists', async () => {
    const targetDir = await makeTempDir('kb-create-store-');
    await mkdir(join(targetDir, '.kb'), { recursive: true });
    const registryPath = await makeRegistryPath();

    const outcome = await create({ targetDir, register: true, registryPath });

    assert.ok(!outcome.ok);
    expect(outcome.reason).toBe('kb-exists');
    expect(await exists(join(targetDir, 'content'))).toBe(false);
  });

  it('returns name-registered and scaffolds nothing when the name is already registered', async () => {
    const targetDir = await makeTempDir('kb-create-store-');
    const registryPath = await makeRegistryPath();
    await mkdir(dirname(registryPath), { recursive: true });
    await writeFile(registryPath, `kbs:\n  ${basename(targetDir)}:\n    path: /elsewhere\n`, 'utf8');

    const outcome = await create({ targetDir, register: true, registryPath });

    assert.ok(!outcome.ok);
    expect(outcome.reason).toBe('name-registered');
    expect(await exists(join(targetDir, '.kb'))).toBe(false);
  });

  it('returns kb-exists when .kb exists as a regular file', async () => {
    const targetDir = await makeTempDir('kb-create-store-');
    await writeFile(join(targetDir, '.kb'), 'not a directory\n', 'utf8');
    const registryPath = await makeRegistryPath();

    const outcome = await create({ targetDir, register: true, registryPath });

    assert.ok(!outcome.ok);
    expect(outcome.reason).toBe('kb-exists');
    expect(await exists(join(targetDir, 'content'))).toBe(false);
  });
});

// region | Helpers

/** Reports whether something exists at the path. */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Returns an absent `kb.yaml` path beneath an uncreated `.agents/` dir in a fresh temp directory. */
async function makeRegistryPath(): Promise<string> {
  return join(await makeTempDir('kb-create-reg-'), '.agents', 'kb.yaml');
}

/** Creates a fresh empty temp directory with the given prefix. */
async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

// endregion | Helpers
