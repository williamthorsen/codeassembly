import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { defaultKbConfig } from '../../config/config-schema.ts';
import { loadKbConfig } from '../../config/load-config.ts';
import { EDITORCONFIG_FILE, PRETTIER_CONFIG_FILE } from '../../layout/index.ts';
import { renderNote } from '../../note-io/write-note.ts';
import { loadAliases } from '../../tags/load-aliases.ts';
import { makeKbRoot } from '../../test-utils/kb-root.ts';
import { makeTempDir } from '../../test-utils/make-temp-dir.ts';
import {
  canonicalPrettierConfig,
  renderAliasesSeed,
  renderConfigSeed,
  renderEditorconfigSeed,
  renderPrettierSeed,
} from '../render-seeds.ts';

describe(renderConfigSeed, () => {
  it('produces a fully-commented config that loads back to the default config', async () => {
    const kbRoot = await makeKbRoot({ config: renderConfigSeed() });

    const config = await loadKbConfig({ kbRoot });

    expect(config).toEqual(defaultKbConfig);
  });

  it('documents the default target and exclude patterns', () => {
    const seed = renderConfigSeed();

    for (const pattern of [...defaultKbConfig.targets, ...defaultKbConfig.exclude]) {
      expect(seed).toContain(pattern);
    }
  });
});

describe(renderAliasesSeed, () => {
  it('produces an aliases stub that loads to an empty map', async () => {
    const kbRoot = await makeKbRoot({ aliases: renderAliasesSeed() });

    const aliases = await loadAliases({ kbRoot });

    expect(aliases.size).toBe(0);
  });
});

describe(renderEditorconfigSeed, () => {
  it('supplies the width, indent, and line endings that Prettier resolves', async () => {
    const storePath = await makeSeededStore();

    const resolved = await resolveConfig(join(storePath, 'note.md'), { editorconfig: true });

    // Prettier maps these from `.editorconfig` rather than from `.prettierrc.yaml`, which is what lets one file serve
    // the editor and the formatter alike. Without it the width would fall back to Prettier's default of 80.
    expect(resolved).toMatchObject({ endOfLine: 'lf', printWidth: 120, tabWidth: 2, useTabs: false });
  });
});

describe(renderPrettierSeed, () => {
  it('produces a commented config that parses back to the canonical options', () => {
    const parsed: unknown = parse(renderPrettierSeed());

    expect(parsed).toEqual(canonicalPrettierConfig);
  });

  it('emits options that Prettier reads back unchanged', async () => {
    const storePath = await makeSeededStore();

    const resolved = await resolveConfig(join(storePath, 'note.md'));

    // `stringify` emits a bare `off`, which YAML 1.1 would read as boolean false and Prettier would then reject.
    expect(resolved).toEqual(canonicalPrettierConfig);
  });

  it('leaves a note written by the note writer byte-identical, and formats idempotently', async () => {
    const storePath = await makeSeededStore();
    const notePath = join(storePath, 'note.md');
    const note = await readFile(notePath, 'utf8');
    const options = { ...(await resolveConfig(notePath, { editorconfig: true })), filepath: notePath };

    const formatted = await format(note, options);

    expect(formatted).toBe(note);
    expect(await format(formatted, options)).toBe(formatted);
  });
});

// region | Helpers

/**
 * Creates a temp store holding both rendered formatting seeds and one note whose `tags` list exceeds the print width.
 */
async function makeSeededStore(): Promise<string> {
  const storePath = await makeTempDir('kb-prettier-');
  await writeFile(join(storePath, EDITORCONFIG_FILE), renderEditorconfigSeed());
  await writeFile(join(storePath, PRETTIER_CONFIG_FILE), renderPrettierSeed());
  const fields = {
    recordType: 'event',
    id: '01KTNR3NGMJ89D6YJTNJCD091A',
    tags: [
      'guidance-refinement',
      'code-style',
      'function-descriptions',
      'declarative-voice',
      'function-ordering',
      'ambiguous-guidance',
      'frontmatter-round-trip',
    ],
  };
  await writeFile(join(storePath, 'note.md'), renderNote(fields, 'A body paragraph.\n'));
  return storePath;
}

// endregion | Helpers
