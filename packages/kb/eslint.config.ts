import baseConfig from '@williamthorsen/eslint-config-typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

const config = defineConfig([
  ...baseConfig,
  globalIgnores([
    '**/coverage/**',
    '**/dist/**',
    '**/local/**',
    // Ignore test fixtures that are intentionally syntactically broken.
    '**/__tests__/**/fixtures/**/*malformed*/**',
    '**/__tests__/**/fixtures/**/*malformed*',
  ]),
]);

export default config;
