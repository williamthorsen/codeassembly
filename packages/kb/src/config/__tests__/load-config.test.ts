import { describe, expect, it } from 'vitest';

import { makeKbRoot } from '../../test-utils/scaffolding.ts';
import { defaultKbConfig } from '../config-schema.ts';
import { isKbLoaderError, KbLoaderError } from '../kb-loader-error.ts';
import { loadKbConfig } from '../load-config.ts';

describe(loadKbConfig, () => {
  it('returns the default config when no config.yaml exists', async () => {
    const kbRoot = await makeKbRoot();

    expect(await loadKbConfig({ kbRoot })).toEqual(defaultKbConfig);
  });

  it('loads targets and exclude from a valid config.yaml', async () => {
    const kbRoot = await makeKbRoot({ config: 'targets:\n  - "**/*.md"\nexclude:\n  - "drafts/**"\n' });

    expect(await loadKbConfig({ kbRoot })).toEqual({ targets: ['**/*.md'], exclude: ['drafts/**'] });
  });

  it('inherits the default for an omitted field', async () => {
    const kbRoot = await makeKbRoot({ config: 'targets:\n  - "notes/**/*.md"\n' });

    expect(await loadKbConfig({ kbRoot })).toEqual({
      targets: ['notes/**/*.md'],
      exclude: defaultKbConfig.exclude,
    });
  });

  it('throws a KbLoaderError naming the file when the YAML is malformed', async () => {
    const kbRoot = await makeKbRoot({ config: 'targets: [unterminated\n' });

    await expect(loadKbConfig({ kbRoot })).rejects.toBeInstanceOf(KbLoaderError);
    await expect(loadKbConfig({ kbRoot })).rejects.toThrow(/config\.yaml/);
  });

  it('throws a KbLoaderError naming the file when targets is the wrong type', async () => {
    const kbRoot = await makeKbRoot({ config: 'targets: not-a-list\n' });

    await expect(loadKbConfig({ kbRoot })).rejects.toBeInstanceOf(KbLoaderError);
  });

  it('thrown KbLoaderError is distinguishable from a plain Error via the kind discriminant', async () => {
    const kbRoot = await makeKbRoot({ config: 'targets: 42\n' });

    const error = await loadKbConfig({ kbRoot }).catch((error_: unknown) => error_);

    expect(isKbLoaderError(error)).toBe(true);
    expect(isKbLoaderError(new Error('plain'))).toBe(false);
  });
});
