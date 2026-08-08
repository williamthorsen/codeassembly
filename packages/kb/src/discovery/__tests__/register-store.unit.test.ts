import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { makeRegistryPath, seedRegistry } from '../../test-utils/scaffolding.ts';
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

  it('adds a new store while preserving existing entries', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'kbs:\n  existing:\n    path: /abs/existing\n');

    const result = await registerStore({ registryPath, name: 'mystore', storePath: '/abs/mystore' });

    expect(result.status).toBe('added');
    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.entries.map((entry) => entry.name)).toEqual(['existing', 'mystore']);
  });

  it('preserves existing comments when adding', async () => {
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

  it('writes an entry with its description above its path', async () => {
    const registryPath = await makeRegistryPath();

    await registerStore({ registryPath, name: 'mystore', storePath: '/abs/mystore', description: 'My store' });

    const text = await readFile(registryPath, 'utf8');
    expect(text).toMatch(/description: My store\n {4}path: \/abs\/mystore/);
  });

  it('orders the entries alphabetically when the registry was unsorted', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(
      registryPath,
      'kbs:\n  coding:\n    path: /abs/coding\n  codeassembly:\n    path: /abs/codeassembly\n',
    );

    await registerStore({ registryPath, name: 'atlas', storePath: '/abs/atlas' });

    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.entries.map((entry) => entry.name)).toEqual(['atlas', 'codeassembly', 'coding']);
  });

  it('orders names case-insensitively', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'kbs:\n  Zebra:\n    path: /abs/zebra\n  apple:\n    path: /abs/apple\n');

    await registerStore({ registryPath, name: 'mango', storePath: '/abs/mango' });

    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.entries.map((entry) => entry.name)).toEqual(['apple', 'mango', 'Zebra']);
  });

  it('carries an entry comment along when the entry moves', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(
      registryPath,
      'kbs:\n  coding:\n    path: /abs/coding\n  # the personal vault\n  personal:\n    path: /abs/personal\n',
    );

    await registerStore({ registryPath, name: 'atlas', storePath: '/abs/atlas' });

    const text = await readFile(registryPath, 'utf8');
    expect(text).toMatch(/# the personal vault\n {2}personal:/);
  });

  it('leaves a comment preceding the first entry at the head of the block', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'kbs:\n  # stores\n  coding:\n    path: /abs/coding\n');

    await registerStore({ registryPath, name: 'atlas', storePath: '/abs/atlas' });

    const text = await readFile(registryPath, 'utf8');
    expect(text).toMatch(/kbs:\n {2}# stores\n {2}atlas:/);
  });

  it('preserves the default_kb pointer when sorting', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'default_kb: coding\nkbs:\n  coding:\n    path: /abs/coding\n');

    await registerStore({ registryPath, name: 'atlas', storePath: '/abs/atlas' });

    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.defaultKb?.name).toBe('coding');
  });

  it('leaves the file byte-identical when the name is already registered', async () => {
    const registryPath = await makeRegistryPath();
    const seed = 'kbs:\n  coding:\n    path: /abs/coding\n  atlas:\n    path: /abs/atlas\n';
    await seedRegistry(registryPath, seed);

    await registerStore({ registryPath, name: 'coding', storePath: '/abs/replacement' });

    expect(await readFile(registryPath, 'utf8')).toBe(seed);
  });

  it('throws when the existing registry is structurally invalid', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'kbs: not-a-mapping\n');

    await expect(registerStore({ registryPath, name: 'mystore', storePath: '/abs/mystore' })).rejects.toThrow();
  });

  it('throws when the entry it would write is structurally invalid', async () => {
    const registryPath = await makeRegistryPath();

    await expect(registerStore({ registryPath, name: 'mystore', storePath: '' })).rejects.toThrow();
  });
});
