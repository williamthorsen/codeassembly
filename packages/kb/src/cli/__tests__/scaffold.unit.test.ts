import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { pathExists } from '../../filesystem/exists.ts';
import { ALIASES_FILE, CONFIG_FILE, CONTENT_DIR, EVENTS_DIR } from '../../layout/index.ts';
import { makeStore } from '../../test-utils/make-store.ts';
import { makeTempDir } from '../../test-utils/make-temp-dir.ts';
import { getRegistryPathFor, seedRegistry } from '../../test-utils/registry.ts';
import { run } from '../run.ts';

describe('kb scaffold', () => {
  it('writes every canonical file a bare store lacks', async () => {
    const store = await makeStore({});

    const result = await run({ argv: ['scaffold'], cwd: store });

    expect(result.exitCode).toBe(0);
    for (const path of [CONFIG_FILE, ALIASES_FILE, CONTENT_DIR, EVENTS_DIR]) {
      expect(await pathExists(join(store, path))).toBe(true);
    }
  });

  it('reports each canonical path and what it did about it', async () => {
    const store = await makeStore({ [CONFIG_FILE]: 'targets: []\n' });

    const result = await run({ argv: ['scaffold'], cwd: store });

    expect(result.stdout).toBe(
      `Scaffolded knowledge base at ${store}\n` +
        `  present  ${CONFIG_FILE}\n` +
        `  created  ${ALIASES_FILE}\n` +
        `  created  ${CONTENT_DIR}/\n` +
        `  created  ${EVENTS_DIR}/\n`,
    );
  });

  it('leaves an existing canonical file untouched', async () => {
    const store = await makeStore({ [CONFIG_FILE]: 'targets: []\n' });

    await run({ argv: ['scaffold'], cwd: store });

    expect(await readFile(join(store, CONFIG_FILE), 'utf8')).toBe('targets: []\n');
  });

  it('replaces an existing canonical file under --force', async () => {
    const store = await makeStore({ [CONFIG_FILE]: 'targets: []\n' });

    const result = await run({ argv: ['scaffold', '--force'], cwd: store });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`replaced ${CONFIG_FILE}`);
    expect(await readFile(join(store, CONFIG_FILE), 'utf8')).toContain('targets:');
  });

  it('writes nothing on a second run', async () => {
    const store = await makeStore({});

    await run({ argv: ['scaffold'], cwd: store });
    const result = await run({ argv: ['scaffold'], cwd: store });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('created');
    expect(result.stdout).not.toContain('replaced');
  });

  it('back-fills a store named with --kb from outside it', async () => {
    const store = await makeStore({});
    const home = await makeTempDir('kb-scaffold-home-');
    await seedRegistry(getRegistryPathFor(home), `kbs:\n  mirror:\n    path: ${store}\n`);
    const elsewhere = await makeTempDir('kb-scaffold-elsewhere-');

    const result = await run({ argv: ['scaffold', '--kb', 'mirror'], cwd: elsewhere, home });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"mirror"');
    expect(await pathExists(join(store, CONFIG_FILE))).toBe(true);
  });

  it('exits 2 when no .kb/ directory is found', async () => {
    const empty = await makeTempDir('kb-scaffold-empty-');

    const result = await run({ argv: ['scaffold'], cwd: empty });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('no .kb/');
    expect(await pathExists(join(empty, CONFIG_FILE))).toBe(false);
  });

  it('exits 2 for a --kb name that is not registered', async () => {
    const store = await makeStore({});

    const result = await run({ argv: ['scaffold', '--kb', 'absent'], cwd: store });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('does not match any registered knowledge base');
  });

  it('exits 2 for a registered path holding no .kb/, writing nothing there', async () => {
    const bare = await makeTempDir('kb-scaffold-bare-');
    const home = await makeTempDir('kb-scaffold-home-');
    await seedRegistry(getRegistryPathFor(home), `kbs:\n  phantom:\n    path: ${bare}\n`);

    const result = await run({ argv: ['scaffold', '--kb', 'phantom'], cwd: bare, home });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('kb create');
    expect(await pathExists(join(bare, CONFIG_FILE))).toBe(false);
  });

  it('refuses a store the registry marks readonly', async () => {
    const store = await makeStore({});
    const home = await makeReadonlyHome(store);

    const result = await run({ argv: ['scaffold', '--kb', 'mirror'], cwd: store, home });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('readonly');
    expect(await pathExists(join(store, CONFIG_FILE))).toBe(false);
  });

  it('refuses a readonly store discovered from inside it', async () => {
    const store = await makeStore({});
    const home = await makeReadonlyHome(store);

    const result = await run({ argv: ['scaffold'], cwd: store, home });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('readonly');
    expect(await pathExists(join(store, CONFIG_FILE))).toBe(false);
  });

  it('accepts the equals form of --kb', async () => {
    const store = await makeStore({});
    const home = await makeTempDir('kb-scaffold-home-');
    await seedRegistry(getRegistryPathFor(home), `kbs:\n  mirror:\n    path: ${store}\n`);

    const result = await run({ argv: ['scaffold', '--kb=mirror'], cwd: store, home });

    expect(result.exitCode).toBe(0);
  });

  it('exits 2 for an unknown flag', async () => {
    const store = await makeStore({});

    const result = await run({ argv: ['scaffold', '--merge'], cwd: store });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('unknown flag');
  });

  it('exits 2 for a positional argument', async () => {
    const store = await makeStore({});

    const result = await run({ argv: ['scaffold', 'init'], cwd: store });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('unexpected argument');
  });

  it('prints help for scaffold --help', async () => {
    const result = await run({ argv: ['scaffold', '--help'], cwd: process.cwd() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: kb scaffold');
  });

  it('lists scaffold in the top-level help', async () => {
    const result = await run({ argv: [], cwd: process.cwd() });

    expect(result.stdout).toContain('scaffold');
  });
});

// region | Helpers

/** Stands up an isolated home registering `storePath` as a readonly KB named `mirror`; returns the home dir. */
async function makeReadonlyHome(storePath: string): Promise<string> {
  const home = await makeTempDir('kb-scaffold-home-');
  await seedRegistry(getRegistryPathFor(home), `kbs:\n  mirror:\n    path: ${storePath}\n    readonly: true\n`);
  return home;
}

// endregion | Helpers
