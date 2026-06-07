import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultKbConfig } from '../../config/config-schema.ts';
import { loadKbConfig } from '../../config/load-config.ts';
import { defaultSchema } from '../../schema/default-schema.ts';
import { loadSchema } from '../../schema/load-schema.ts';
import { loadAliases } from '../../tags/load-aliases.ts';
import type { KbRoot } from '../../types.ts';
import { renderAliasesSeed, renderConfigSeed, renderSchemaSeed } from '../render-seeds.ts';

describe(renderSchemaSeed, () => {
  it('produces a schema that loads back to the bundled default schema', async () => {
    const kbRoot = await makeKbRootWith({ schema: renderSchemaSeed() });

    const schema = await loadSchema({ kbRoot });

    expect(schema).toEqual(defaultSchema);
  });
});

describe(renderConfigSeed, () => {
  it('produces a fully-commented config that loads back to the default config', async () => {
    const kbRoot = await makeKbRootWith({ config: renderConfigSeed() });

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
    const kbRoot = await makeKbRootWith({ aliases: renderAliasesSeed() });

    const aliases = await loadAliases({ kbRoot });

    expect(aliases.size).toBe(0);
  });
});

// region | Helpers

/** Stands up a temp KB root and writes whichever seed files are supplied into its `.kb/` directory. */
async function makeKbRootWith(files: { schema?: string; config?: string; aliases?: string }): Promise<KbRoot> {
  const path = await mkdtemp(join(tmpdir(), 'kb-seed-'));
  const kbDir = join(path, '.kb');
  await mkdir(kbDir, { recursive: true });
  if (files.schema !== undefined) await writeFile(join(kbDir, 'schema.yaml'), files.schema, 'utf8');
  if (files.config !== undefined) await writeFile(join(kbDir, 'config.yaml'), files.config, 'utf8');
  if (files.aliases !== undefined) await writeFile(join(kbDir, 'tag-aliases.yaml'), files.aliases, 'utf8');
  return { path, kbDir, via: 'ancestor-walk' };
}

// endregion | Helpers
