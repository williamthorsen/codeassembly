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
  {
    files: ['package.json'],
    rules: {
      // The package ships a CLI and no importable surface: its empty `exports` forecloses deep imports into the
      // build output, leaving the rule no root export to style.
      'package-json/exports-subpaths-style': 'off',
    },
  },
]);

export default config;
