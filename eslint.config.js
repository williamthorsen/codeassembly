import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import config from '@williamthorsen/eslint-config-typescript';
import { globalIgnores } from 'eslint/config';

const thisFilePath = fileURLToPath(import.meta.url);
const thisDirPath = dirname(thisFilePath);

/**
 * @type {import('eslint').Linter.FlatConfig[]}
 */
export default [
  ...config,
  globalIgnores([
    '**/*.sh',
    '.readyup/**/*.js',
    '**.playwright-mcp/**',
    '**/coverage/**',
    '**/dist/**',
    '**/local/**',
    // Test fixtures that are intentionally syntactically broken — linting them
    // would flag the very defect they exist to exercise.
    '**/__tests__/**/fixtures/**/malformed-yaml/**',
    '**/__tests__/**/fixtures/**/syntactically-malformed.*',
  ]),
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
        project: ['./tsconfig.eslint.json', './packages/*/tsconfig.eslint.json'],
        tsconfigRootDir: thisDirPath,
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
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
];
