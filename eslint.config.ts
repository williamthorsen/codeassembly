import baseConfig from '@williamthorsen/eslint-config-typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

import { deferredLintRules } from './.config/eslint/deferred-lint-rules.ts';

const config = defineConfig([
  ...baseConfig,
  globalIgnores([
    '**/*.sh',
    '**/.claude/**',
    '**/.readyup/**/*.js',
    '**/.rovodev/**',
    '**.playwright-mcp/**',
    '**/coverage/**',
    '**/dist/**',
    '**/local/**',
    // Throwaway spikes live outside the workspace and are exempt from lint.
    'spikes/**',
    // Ignore test fixtures that are intentionally syntactically broken.
    '**/__tests__/**/fixtures/**/*malformed*/**',
    '**/__tests__/**/fixtures/**/*malformed*',
  ]),
  {
    files: ['**/*.ts', '**/*.mts', '**/*.tsx', '**/*.md/*.ts', '**/*.js'],
    rules: deferredLintRules,
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs', '**/*.ts', '**/*.tsx'],
    rules: {
      'n/no-extraneous-import': 'off',
      'n/no-missing-import': 'off',
      'n/no-unpublished-import': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.mts', '**/*.tsx', '**/*.md/*.ts'],
    languageOptions: {
      parserOptions: {
        // Anchor the project service (enabled by the base config) at the repo root.
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-confusing-void-expression': [
        'warn',
        {
          ignoreArrowShorthand: true,
          ignoreVoidOperator: true,
          ignoreVoidReturningFunctions: true,
        },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowBoolean: true,
          allowNumber: true,
        },
      ],
      'unicorn/consistent-class-member-order': 'off', // 🔴⚫ Conflicts with `@typescript-eslint/member-ordering` and most style guides
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
]);

export default config;
