import { createConfig, patterns } from '@williamthorsen/eslint-config-typescript';
import { defineConfig } from 'eslint/config';
import reactManifest from 'react/package.json' with { type: 'json' };

import baseConfig from '../../eslint.config.ts';

const config = defineConfig([
  ...baseConfig,
  ...(await createConfig.react()),
  {
    settings: {
      react: { version: reactManifest.version },
    },
  },
  {
    files: patterns.testFiles,
    extends: [await createConfig.reactTestingLibrary()],
  },
]);

export default config;
