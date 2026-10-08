import { defineConfig, globalIgnores } from 'eslint/config';

import baseConfig from '../../eslint.config.ts';

const config = defineConfig([
  ...baseConfig,
  globalIgnores([
    // Completely ignore these files: generated esbuild bundles and shipped harness content.
    'content/scripts/**/*.mjs',
    'content/skills/**/*.mjs',
    'content/skills/**/*-example.ts',
  ]),
]);

export default config;
