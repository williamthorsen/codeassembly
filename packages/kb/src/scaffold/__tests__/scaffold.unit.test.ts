import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { pathExists } from '../../filesystem/exists.ts';
import {
  ALIASES_FILE,
  CONFIG_FILE,
  CONTENT_DIR,
  EVENTS_DIR,
  PRETTIER_CONFIG_FILE,
  resolveKbDir,
} from '../../layout/index.ts';
import { makeTempDir } from '../../test-utils/make-temp-dir.ts';
import { renderConfigSeed } from '../render-seeds.ts';
import { scaffold } from '../scaffold.ts';

describe(scaffold, () => {
  it('writes every canonical path into an empty directory', async () => {
    const storePath = await makeTempDir('kb-scaffold-');

    const entries = await scaffold({ storePath });

    expect(entries).toEqual([
      { path: CONFIG_FILE, action: 'created' },
      { path: ALIASES_FILE, action: 'created' },
      { path: PRETTIER_CONFIG_FILE, action: 'created' },
      { path: `${CONTENT_DIR}/`, action: 'created' },
      { path: `${EVENTS_DIR}/`, action: 'created' },
    ]);
    for (const path of [CONFIG_FILE, ALIASES_FILE, PRETTIER_CONFIG_FILE, CONTENT_DIR, EVENTS_DIR]) {
      expect(await pathExists(join(storePath, path))).toBe(true);
    }
  });

  it('creates the .kb/ directory the seed files live in', async () => {
    const storePath = await makeTempDir('kb-scaffold-');

    await scaffold({ storePath });

    expect(await pathExists(resolveKbDir(storePath))).toBe(true);
  });

  it('writes only what a partially-populated store lacks', async () => {
    const storePath = await makeStoreWithConfig('targets: []\n');

    const entries = await scaffold({ storePath });

    expect(entries).toEqual([
      { path: CONFIG_FILE, action: 'present' },
      { path: ALIASES_FILE, action: 'created' },
      { path: PRETTIER_CONFIG_FILE, action: 'created' },
      { path: `${CONTENT_DIR}/`, action: 'created' },
      { path: `${EVENTS_DIR}/`, action: 'created' },
    ]);
  });

  it('leaves the content of an existing file untouched', async () => {
    const storePath = await makeStoreWithConfig('targets: []\n');

    await scaffold({ storePath });

    expect(await readFile(join(storePath, CONFIG_FILE), 'utf8')).toBe('targets: []\n');
  });

  it('replaces an existing file under force', async () => {
    const storePath = await makeStoreWithConfig('targets: []\n');

    const entries = await scaffold({ storePath, force: true });

    expect(entries[0]).toEqual({ path: CONFIG_FILE, action: 'replaced' });
    expect(await readFile(join(storePath, CONFIG_FILE), 'utf8')).toBe(renderConfigSeed());
  });

  it('reports an existing directory as present, force or not', async () => {
    const storePath = await makeTempDir('kb-scaffold-');
    await mkdir(join(storePath, EVENTS_DIR), { recursive: true });

    const entries = await scaffold({ storePath, force: true });

    expect(entries.filter((entry) => entry.path.endsWith('/'))).toEqual([
      { path: `${CONTENT_DIR}/`, action: 'present' },
      { path: `${EVENTS_DIR}/`, action: 'present' },
    ]);
  });

  it('reports every path as present on a second run', async () => {
    const storePath = await makeTempDir('kb-scaffold-');

    await scaffold({ storePath });
    const entries = await scaffold({ storePath });

    expect(entries.map((entry) => entry.action)).toEqual(['present', 'present', 'present', 'present', 'present']);
  });
});

// region | Helpers

/** Stands up a temp store holding a `.kb/` directory and the given `.kb/config.yaml` content; returns its path. */
async function makeStoreWithConfig(config: string): Promise<string> {
  const storePath = await makeTempDir('kb-scaffold-');
  await mkdir(resolveKbDir(storePath), { recursive: true });
  await writeFile(join(storePath, CONFIG_FILE), config, 'utf8');
  return storePath;
}

// endregion | Helpers
