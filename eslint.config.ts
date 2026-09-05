import path from 'node:path';

import baseConfig from '@williamthorsen/eslint-config-typescript';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

const config = defineConfig([
  ...baseConfig,
  globalIgnores([
    '**/*.sh',
    '**/.claude/**',
    '**/.readyup/**/*.js',
    '**/.rovo/**',
    '**.playwright-mcp/**',
    '**/coverage/**',
    '**/dist/**',
    '**/local/**',
    // Throwaway spikes live outside the workspace and are exempt from lint.
    'spikes/**',
    // Ignore test fixtures no parser can read, marked by a `.malformed` infix.
    '**/__tests__/**/fixtures/**/*.malformed/**',
    '**/__tests__/**/fixtures/**/*.malformed.*',
  ]),
  {
    settings: {
      // `import-x/extensions` needs a resolver to tell a `.js` specifier from the `.ts` file it names.
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          noWarnOnMultipleProjects: true,
          // Name the tsconfigs explicitly; the resolver's cwd-relative default misses packages when lint runs per workspace.
          project: [
            path.join(import.meta.dirname, 'tsconfig.json'),
            path.join(import.meta.dirname, 'packages/*/tsconfig.json'),
          ],
        }),
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs', '**/*.ts', '**/*.tsx'],
    rules: {
      // The rule resolves specifiers itself rather than through the resolver settings above, so fleet's
      // `source`-only export condition reports as missing.
      'n/no-missing-import': 'off',
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
