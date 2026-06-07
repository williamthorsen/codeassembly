import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadKbRegistry } from '../load-registry.ts';
import { registerStore } from '../register-store.ts';

describe(registerStore, () => {
  it('when the registry file is absent, creates it with the store under kbs', async () => {
    const registryPath = await makeRegistryPath();

    const result = await registerStore({ registryPath, name: 'mystore', storePath: '/abs/mystore' });

    expect(result.status).toBe('added');
    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.entries).toHaveLength(1);
    expect(config.entries[0]?.name).toBe('mystore');
    expect(config.entries[0]?.path).toBe('/abs/mystore');
  });

  it('appends a new store while preserving existing entries', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'kbs:\n  existing:\n    path: /abs/existing\n');

    const result = await registerStore({ registryPath, name: 'mystore', storePath: '/abs/mystore' });

    expect(result.status).toBe('added');
    const config = await loadKbRegistry({ userConfigPath: registryPath });
    const names = config.entries.map((entry) => entry.name).toSorted();
    expect(names).toEqual(['existing', 'mystore']);
  });

  it('preserves existing comments when appending', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, '# my registry comment\nkbs:\n  existing:\n    path: /abs/existing\n');

    await registerStore({ registryPath, name: 'mystore', storePath: '/abs/mystore' });

    const text = await readFile(registryPath, 'utf8');
    expect(text).toContain('# my registry comment');
  });

  it('returns already-present and leaves the entry unchanged when the name is registered', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'kbs:\n  mystore:\n    path: /abs/original\n');

    const result = await registerStore({ registryPath, name: 'mystore', storePath: '/abs/replacement' });

    expect(result.status).toBe('already-present');
    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.entries).toHaveLength(1);
    expect(config.entries[0]?.path).toBe('/abs/original');
  });

  it('writes the description when one is provided', async () => {
    const registryPath = await makeRegistryPath();

    await registerStore({ registryPath, name: 'mystore', storePath: '/abs/mystore', description: 'My store' });

    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.entries[0]?.description).toBe('My store');
  });

  it('throws when the existing registry is structurally invalid', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'kbs: not-a-mapping\n');

    await expect(registerStore({ registryPath, name: 'mystore', storePath: '/abs/mystore' })).rejects.toThrow();
  });
});

// region | Helpers

/** Stands up a temp directory and returns an absent `kb.yaml` path beneath an uncreated `.agents/` dir. */
async function makeRegistryPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kb-register-'));
  return join(dir, '.agents', 'kb.yaml');
}

/** Writes seed content to a registry path, creating the `.agents/` parent directory first. */
async function seedRegistry(registryPath: string, content: string): Promise<void> {
  await mkdir(dirname(registryPath), { recursive: true });
  await writeFile(registryPath, content, 'utf8');
}

// endregion | Helpers
