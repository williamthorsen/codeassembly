import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { pathExists } from '../../filesystem/exists.ts';
import { makeRegistryPath, seedRegistry } from '../../test-utils/scaffolding.ts';
import { loadKbRegistry } from '../load-registry.ts';
import { clearDefaultKb, setDefaultKb } from '../set-default-kb.ts';

describe(setDefaultKb, () => {
  it('sets default_kb to a registered KB', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'kbs:\n  coding:\n    path: /abs/coding\n');

    await setDefaultKb({ registryPath, name: 'coding' });

    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.defaultKb?.name).toBe('coding');
  });

  it('changes an existing default_kb', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(
      registryPath,
      'default_kb: coding\nkbs:\n  coding:\n    path: /abs/coding\n  notes:\n    path: /abs/notes\n',
    );

    await setDefaultKb({ registryPath, name: 'notes' });

    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.defaultKb?.name).toBe('notes');
  });

  it('preserves existing comments', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, '# my registry comment\nkbs:\n  coding:\n    path: /abs/coding\n');

    await setDefaultKb({ registryPath, name: 'coding' });

    const text = await readFile(registryPath, 'utf8');
    expect(text).toContain('# my registry comment');
  });

  it('throws when the name is not a registered KB', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'kbs:\n  coding:\n    path: /abs/coding\n');

    await expect(setDefaultKb({ registryPath, name: 'missing' })).rejects.toThrow();
  });

  it('throws when the existing registry is structurally invalid', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'kbs: not-a-mapping\n');

    await expect(setDefaultKb({ registryPath, name: 'coding' })).rejects.toThrow();
  });
});

describe(clearDefaultKb, () => {
  it('removes an existing default_kb', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'default_kb: coding\nkbs:\n  coding:\n    path: /abs/coding\n');

    await clearDefaultKb({ registryPath });

    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.defaultKb).toBeUndefined();
    expect(config.entries).toHaveLength(1);
  });

  it('preserves comments and other entries when clearing', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, '# keep me\ndefault_kb: coding\nkbs:\n  coding:\n    path: /abs/coding\n');

    await clearDefaultKb({ registryPath });

    const text = await readFile(registryPath, 'utf8');
    expect(text).toContain('# keep me');
    expect(text).not.toContain('default_kb');
  });

  it('is a no-op when no default is set', async () => {
    const registryPath = await makeRegistryPath();
    await seedRegistry(registryPath, 'kbs:\n  coding:\n    path: /abs/coding\n');

    await clearDefaultKb({ registryPath });

    const config = await loadKbRegistry({ userConfigPath: registryPath });
    expect(config.defaultKb).toBeUndefined();
  });

  it('does not create the file when it is absent', async () => {
    const registryPath = await makeRegistryPath();

    await clearDefaultKb({ registryPath });

    expect(await pathExists(registryPath)).toBe(false);
  });
});
