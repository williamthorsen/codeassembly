import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { defaultKbConfig } from '../../config/config-schema.ts';
import { loadKbConfig } from '../../config/load-config.ts';
import { loadAliases } from '../../tags/load-aliases.ts';
import { makeKbRoot } from '../../test-utils/kb-root.ts';
import { canonicalPrettierConfig, renderAliasesSeed, renderConfigSeed, renderPrettierSeed } from '../render-seeds.ts';

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

describe(renderPrettierSeed, () => {
  // Round-tripping is what holds the seed to the constant, and it is load-bearing for `embeddedLanguageFormatting`:
  // YAML 1.1 reads a bare `off` as boolean false, which Prettier would reject as an option value.
  it('produces a commented config that parses back to the canonical options', () => {
    const parsed: unknown = parse(renderPrettierSeed());

    expect(parsed).toEqual(canonicalPrettierConfig);
  });
});
