import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadKbRegistry } from '../../discovery/load-registry.ts';
import { pathExists } from '../../filesystem/exists.ts';
import { makeRegistryPath, makeTempDir, seedRegistry } from '../../test-utils/scaffolding.ts';
import { create } from '../create.ts';

describe(create, () => {
  it('scaffolds the .kb seed files and the content directories', async () => {
    const targetDir = await makeTempDir('kb-create-store-');
    const registryPath = await makeRegistryPath();

    const outcome = await create({ targetDir, register: true, registryPath });

    assert.ok(outcome.ok);
    expect(await pathExists(join(targetDir, '.kb', 'schema.yaml'))).toBe(true);
    expect(await pathExists(join(targetDir, '.kb', 'config.yaml'))).toBe(true);
    expect(await pathExists(join(targetDir, '.kb', 'tag-aliases.yaml'))).toBe(true);
    expect(await pathExists(join(targetDir, 'content', 'events'))).toBe(true);
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
    expect(await pathExists(join(targetDir, '.kb', 'schema.yaml'))).toBe(true);
  });

  it('returns kb-exists and scaffolds nothing when .kb already exists', async () => {
    const targetDir = await makeTempDir('kb-create-store-');
    await mkdir(join(targetDir, '.kb'), { recursive: true });
    const registryPath = await makeRegistryPath();

    const outcome = await create({ targetDir, register: true, registryPath });

    assert.ok(!outcome.ok);
    expect(outcome.reason).toBe('kb-exists');
    expect(await pathExists(join(targetDir, 'content'))).toBe(false);
  });

  it('returns name-registered and scaffolds nothing when the name is already registered', async () => {
    const targetDir = await makeTempDir('kb-create-store-');
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, `kbs:\n  ${basename(targetDir)}:\n    path: /elsewhere\n`);

    const outcome = await create({ targetDir, register: true, registryPath });

    assert.ok(!outcome.ok);
    expect(outcome.reason).toBe('name-registered');
    expect(await pathExists(join(targetDir, '.kb'))).toBe(false);
  });

  it('returns kb-exists when .kb exists as a regular file', async () => {
    const targetDir = await makeTempDir('kb-create-store-');
    await writeFile(join(targetDir, '.kb'), 'not a directory\n', 'utf8');
    const registryPath = await makeRegistryPath();

    const outcome = await create({ targetDir, register: true, registryPath });

    assert.ok(!outcome.ok);
    expect(outcome.reason).toBe('kb-exists');
    expect(await pathExists(join(targetDir, 'content'))).toBe(false);
  });

  it('sets the new store as the default when the registry has no default and no other KBs', async () => {
    const targetDir = await makeTempDir('kb-create-store-');
    const registryPath = await makeRegistryPath();

    const outcome = await create({ targetDir, register: true, registryPath });

    assert.ok(outcome.ok);
    expect(outcome.created.defaultKb).toBe('set');
    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.defaultKb?.name).toBe(basename(targetDir));
  });

  it('leaves an existing default_kb unchanged', async () => {
    const targetDir = await makeTempDir('kb-create-store-');
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'default_kb: existing\nkbs:\n  existing:\n    path: /abs/existing\n');

    const outcome = await create({ targetDir, register: true, registryPath });

    assert.ok(outcome.ok);
    expect(outcome.created.defaultKb).toBe('unchanged');
    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.defaultKb?.name).toBe('existing');
  });

  it('defers selection without setting a default when other KBs exist and none is set', async () => {
    const targetDir = await makeTempDir('kb-create-store-');
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'kbs:\n  existing:\n    path: /abs/existing\n');

    const outcome = await create({ targetDir, register: true, registryPath });

    assert.ok(outcome.ok);
    expect(outcome.created.defaultKb).toBe('needs-selection');
    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.defaultKb).toBeUndefined();
  });

  it('omits the default-KB outcome when not registering', async () => {
    const targetDir = await makeTempDir('kb-create-store-');

    const outcome = await create({ targetDir, register: false });

    assert.ok(outcome.ok);
    expect(outcome.created.defaultKb).toBeUndefined();
  });
});
