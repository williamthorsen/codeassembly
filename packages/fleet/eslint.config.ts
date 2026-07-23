import { defineConfig } from 'eslint/config';

import baseConfig from '../../eslint.config.ts';
import { deferredLintRules } from './.config/eslint/deferred-lint-rules.ts';

const config = defineConfig([
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.md/*.ts', '**/*.js'],
    rules: deferredLintRules,
  },
]);

export default config;
