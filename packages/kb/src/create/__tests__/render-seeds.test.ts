import { describe, expect, it } from 'vitest';

import { defaultKbConfig } from '../../config/config-schema.ts';
import { loadKbConfig } from '../../config/load-config.ts';
import { defaultSchema } from '../../schema/default-schema.ts';
import { loadSchema } from '../../schema/load-schema.ts';
import { loadAliases } from '../../tags/load-aliases.ts';
import { makeKbRoot } from '../../test-utils/index.ts';
import { renderAliasesSeed, renderConfigSeed, renderSchemaSeed } from '../render-seeds.ts';

describe(renderSchemaSeed, () => {
  it('produces a schema that loads back to the bundled default schema', async () => {
    const kbRoot = await makeKbRoot({ schema: renderSchemaSeed() });

    const schema = await loadSchema({ kbRoot });

    expect(schema).toEqual(defaultSchema);
  });
});

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
