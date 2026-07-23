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
]);

export default config;
