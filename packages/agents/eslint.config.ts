import { defineConfig, globalIgnores } from 'eslint/config';

import baseConfig from '../../eslint.config.ts';
import { deferredLintRules } from './.config/eslint/deferred-lint-rules.ts';

const config = defineConfig([
  ...baseConfig,
  globalIgnores([
    // Completely ignore these files: generated esbuild bundles and shipped harness content.
    'content/scripts/**/*.mjs',
    'content/skills/**/*.mjs',
    'content/skills/**/*-example.ts',
  ]),
  {
    files: ['**/*.ts', '**/*.mts', '**/*.tsx', '**/*.md/*.ts', '**/*.js'],
    plugins: {},
    rules: deferredLintRules,
  },
  {
    files: ['package.json'],
    rules: {
      // This package ships a CLI and no importable surface, so its `exports` is deliberately empty: it forecloses
      // deep imports into the build output rather than describing an entry point. The rule styles a root export
      // that does not exist here.
      'package-json/exports-subpaths-style': 'off',
    },
  },
]);

export default config;
