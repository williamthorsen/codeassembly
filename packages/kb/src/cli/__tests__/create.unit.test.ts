import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadKbRegistry } from '../../discovery/load-registry.ts';
import { pathExists } from '../../filesystem/exists.ts';
import { getRegistryPathFor, makeTempDir, seedRegistry } from '../../test-utils/scaffolding.ts';
import { run } from '../run.ts';
import type { SelectKbChoice, SelectKbPrompt } from '../select-kb-prompt.ts';

describe('kb create', () => {
  it('scaffolds a store in cwd and registers it under the directory name', async () => {
    const cwd = await makeTempDir('kb-cli-store-');
    const home = await makeTempDir('kb-cli-home-');

    const result = await run({ argv: ['create'], cwd, home });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(basename(cwd));
    expect(result.stdout).toContain('Registered in');
    expect(await pathExists(join(cwd, '.kb', 'config.yaml'))).toBe(true);
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
    expect(await pathExists(join(cwd, '.kb', 'config.yaml'))).toBe(true);
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

  it('sets the new store as the default when the registry is empty', async () => {
    const cwd = await makeTempDir('kb-cli-store-');
    const home = await makeTempDir('kb-cli-home-');

    const result = await run({ argv: ['create'], cwd, home });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Set as the default knowledge base.');
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.defaultKb?.name).toBe(basename(cwd));
  });

  it('prompts to choose the default when other KBs exist and none is set', async () => {
    const cwd = await makeTempDir('kb-cli-store-');
    const home = await makeTempDir('kb-cli-home-');
    await seedRegistry(getRegistryPathFor(home), 'kbs:\n  existing:\n    path: /abs/existing\n');

    const result = await run({ argv: ['create'], cwd, home, selectKb: stubPrompt({ kind: 'kb', index: 0 }) });

    expect(result.exitCode).toBe(0);
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.defaultKb?.name).toBe('existing');
  });

  it('offers the newly-created store among the picker choices', async () => {
    const cwd = await makeTempDir('kb-cli-store-');
    const home = await makeTempDir('kb-cli-home-');
    await seedRegistry(getRegistryPathFor(home), 'kbs:\n  existing:\n    path: /abs/existing\n');

    // The new store is appended after the seeded one, so index 1 selects it.
    const result = await run({ argv: ['create'], cwd, home, selectKb: stubPrompt({ kind: 'kb', index: 1 }) });

    expect(result.exitCode).toBe(0);
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.defaultKb?.name).toBe(basename(cwd));
  });

  it('exits 0 once the store is created even when the delegated selection fails', async () => {
    const cwd = await makeTempDir('kb-cli-store-');
    const home = await makeTempDir('kb-cli-home-');
    await seedRegistry(getRegistryPathFor(home), 'kbs:\n  existing:\n    path: /abs/existing\n');

    const result = await run({ argv: ['create'], cwd, home, selectKb: stubPrompt({ kind: 'kb', index: 99 }) });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('invalid selection');
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.entries.some((entry) => entry.name === basename(cwd))).toBe(true);
    expect(config.defaultKb).toBeUndefined();
  });

  it('leaves the default unset and points to set-default when other KBs exist and stdin is non-interactive', async () => {
    const cwd = await makeTempDir('kb-cli-store-');
    const home = await makeTempDir('kb-cli-home-');
    await seedRegistry(getRegistryPathFor(home), 'kbs:\n  existing:\n    path: /abs/existing\n');

    const result = await run({ argv: ['create'], cwd, home });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('kb set-default');
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.defaultKb).toBeUndefined();
  });

  it('still succeeds with no default when the picker is cancelled', async () => {
    const cwd = await makeTempDir('kb-cli-store-');
    const home = await makeTempDir('kb-cli-home-');
    await seedRegistry(getRegistryPathFor(home), 'kbs:\n  existing:\n    path: /abs/existing\n');

    const result = await run({ argv: ['create'], cwd, home, selectKb: stubPrompt({ kind: 'cancel' }) });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No changes made.');
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.defaultKb).toBeUndefined();
  });

  it('leaves an existing default unchanged and announces no default', async () => {
    const cwd = await makeTempDir('kb-cli-store-');
    const home = await makeTempDir('kb-cli-home-');
    await seedRegistry(getRegistryPathFor(home), 'default_kb: existing\nkbs:\n  existing:\n    path: /abs/existing\n');

    const result = await run({ argv: ['create'], cwd, home });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('Set as the default knowledge base.');
    const config = await loadKbRegistry({ userConfigPath: getRegistryPathFor(home) });
    expect(config.defaultKb?.name).toBe('existing');
  });
});

// region | Helpers

/** A stub picker that resolves to a fixed choice, standing in for the interactive default-KB prompt. */
function stubPrompt(choice: SelectKbChoice): SelectKbPrompt {
  return () => Promise.resolve(choice);
}

// endregion | Helpers
