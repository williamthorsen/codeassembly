import { buildHarnessConfigSchema } from '@williamthorsen/telefactor/server';
import { describe, expect, it } from 'vitest';

import { buildConfigTemplate, viewerBuiltInHarnesses, viewerConfigSchema } from '../built-in-harnesses.ts';

describe(buildConfigTemplate, () => {
  it('writes a config file that resolves to the built-in settings', () => {
    const schema = buildHarnessConfigSchema(viewerConfigSchema, viewerBuiltInHarnesses);

    const parsed = schema.parse(JSON.parse(buildConfigTemplate()));

    expect(parsed).toStrictEqual({
      default: 'claude-code',
      timeoutMinutes: 10,
      harnesses: viewerBuiltInHarnesses.harnesses,
      app: { promptsDirectory: 'prompts' },
    });
  });
});
