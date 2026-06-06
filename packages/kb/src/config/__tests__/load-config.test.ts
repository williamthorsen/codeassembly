import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { KbRoot } from '../../types.ts';
import { defaultKbConfig } from '../config-schema.ts';
import { isKbLoaderError, KbLoaderError } from '../kb-loader-error.ts';
import { loadKbConfig } from '../load-config.ts';

/** Stands up a temp KB root, optionally writing a `.kb/config.yaml`, and returns its `KbRoot`. */
async function makeKbRoot(configYaml?: string): Promise<KbRoot> {
  const path = await mkdtemp(join(tmpdir(), 'kb-config-'));
  await mkdir(join(path, '.kb'), { recursive: true });
  if (configYaml !== undefined) {
    await writeFile(join(path, '.kb', 'config.yaml'), configYaml, 'utf8');
  }
  return { path, kbDir: join(path, '.kb'), via: 'ancestor-walk' };
}

describe(loadKbConfig, () => {
  it('returns the default config when no config.yaml exists', async () => {
    const kbRoot = await makeKbRoot();

    expect(await loadKbConfig({ kbRoot })).toEqual(defaultKbConfig);
  });

  it('loads targets and exclude from a valid config.yaml', async () => {
    const kbRoot = await makeKbRoot('targets:\n  - "**/*.md"\nexclude:\n  - "drafts/**"\n');

    expect(await loadKbConfig({ kbRoot })).toEqual({ targets: ['**/*.md'], exclude: ['drafts/**'] });
  });

  it('inherits the default for an omitted field', async () => {
    const kbRoot = await makeKbRoot('targets:\n  - "notes/**/*.md"\n');

    expect(await loadKbConfig({ kbRoot })).toEqual({
      targets: ['notes/**/*.md'],
      exclude: defaultKbConfig.exclude,
    });
  });

  it('throws a KbLoaderError naming the file when the YAML is malformed', async () => {
    const kbRoot = await makeKbRoot('targets: [unterminated\n');

    await expect(loadKbConfig({ kbRoot })).rejects.toBeInstanceOf(KbLoaderError);
    await expect(loadKbConfig({ kbRoot })).rejects.toThrow(/config\.yaml/);
  });

  it('throws a KbLoaderError naming the file when targets is the wrong type', async () => {
    const kbRoot = await makeKbRoot('targets: not-a-list\n');

    await expect(loadKbConfig({ kbRoot })).rejects.toBeInstanceOf(KbLoaderError);
  });

  it('thrown KbLoaderError is distinguishable from a plain Error via the kind discriminant', async () => {
    const kbRoot = await makeKbRoot('targets: 42\n');

    const error = await loadKbConfig({ kbRoot }).catch((error_: unknown) => error_);

    expect(isKbLoaderError(error)).toBe(true);
    expect(isKbLoaderError(new Error('plain'))).toBe(false);
  });
});
