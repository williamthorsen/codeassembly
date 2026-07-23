import baseConfig from '@williamthorsen/eslint-config-typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

import { deferredLintRules } from './.config/eslint/deferred-lint-rules.ts';

const config = defineConfig([
  ...baseConfig,
  globalIgnores([
    '**/coverage/**',
    '**/dist/**',
    '**/local/**',
    // Ignore test fixtures that are intentionally syntactically broken.
    // '**/__tests__/**/fixtures/**/*malformed*/**',
    // '**/__tests__/**/fixtures/**/*malformed*',
  ]),
  {
    files: ['**/*.ts', '**/*.mts', '**/*.tsx', '**/*.md/*.ts', '**/*.js'],
    rules: deferredLintRules,
  },
]);

export default config;
