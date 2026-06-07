import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadKbRegistry } from '../../discovery/load-registry.ts';
import { pathExists } from '../../filesystem/exists.ts';
import { getRegistryPathFor, makeTempDir, seedRegistry } from '../../test-utils/index.ts';
import { run } from '../run.ts';

describe('kb create', () => {
  it('scaffolds a store in cwd and registers it under the directory name', async () => {
    const cwd = await makeTempDir('kb-cli-store-');
    const home = await makeTempDir('kb-cli-home-');

    const result = await run({ argv: ['create'], cwd, home });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(basename(cwd));
    expect(result.stdout).toContain('Registered in');
    expect(await pathExists(join(cwd, '.kb', 'schema.yaml'))).toBe(true);
    expect(await pathExists(join(cwd, 'content', 'events'))).toBe(true);
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.entries[0]?.name).toBe(basename(cwd));
  });

  it('registers under the provided --name', async () => {
    const cwd = await makeTempDir('kb-cli-store-');
    const home = await makeTempDir('kb-cli-home-');

    const result = await run({ argv: ['create', '--name', 'custom'], cwd, home });

    expect(result.exitCode).toBe(0);
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.entries[0]?.name).toBe('custom');
  });

  it('scaffolds without writing the registry when --no-register is given', async () => {
    const cwd = await makeTempDir('kb-cli-store-');
    const home = await makeTempDir('kb-cli-home-');

    const result = await run({ argv: ['create', '--no-register'], cwd, home });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Not registered');
    expect(await pathExists(join(cwd, '.kb', 'schema.yaml'))).toBe(true);
    expect(await pathExists(getRegistryPathFor(home))).toBe(false);
  });

  it('exits 2 when a store already exists in cwd', async () => {
    const cwd = await makeTempDir('kb-cli-store-');
    const home = await makeTempDir('kb-cli-home-');
    await mkdir(join(cwd, '.kb'), { recursive: true });

    const result = await run({ argv: ['create'], cwd, home });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('already exists');
  });

  it('exits 2 when the store name is already registered', async () => {
    const cwd = await makeTempDir('kb-cli-store-');
    const home = await makeTempDir('kb-cli-home-');
    const registryPath = getRegistryPathFor(home);
    await seedRegistry(registryPath, `kbs:\n  ${basename(cwd)}:\n    path: /elsewhere\n`);

    const result = await run({ argv: ['create'], cwd, home });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('already registered');
  });

  it('exits 2 on an unknown flag', async () => {
    const cwd = await makeTempDir('kb-cli-store-');
    const home = await makeTempDir('kb-cli-home-');

    const result = await run({ argv: ['create', '--bogus'], cwd, home });

    expect(result.exitCode).toBe(2);
  });

  it('prints command help with --help', async () => {
    const result = await run({ argv: ['create', '--help'], cwd: '/tmp', home: '/tmp' });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('kb create');
  });

  it('lists create in the top-level help', async () => {
    const result = await run({ argv: [], cwd: '/tmp', home: '/tmp' });

    expect(result.stdout).toContain('create');
  });
});
