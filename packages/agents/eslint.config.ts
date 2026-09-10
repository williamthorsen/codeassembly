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
  {
    // The change-grammar engine is written to move to another repository unchanged, so it depends on nothing but
    // itself: no module outside its directory, no package, no Node builtin, and no `process`. The taxonomy reaches it
    // as an argument. `src/change-grammar/__tests__/lint-boundary.unit.test.ts` proves the block still fires.
    files: ['src/change-grammar/**/*.ts'],
    rules: {
      'import-x/no-nodejs-modules': 'error',
      'import-x/no-restricted-paths': [
        'error',
        {
          basePath: import.meta.dirname,
          zones: [
            {
              except: ['./agents/src/change-grammar'],
              from: '..',
              message: 'The change-grammar engine imports nothing outside its own directory.',
              target: './src/change-grammar',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { message: 'The change-grammar engine reads no ambient environment.', name: 'process' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              message:
                'The change-grammar engine depends on no package, so it carries none to a repository it moves to.',
              regex: '^[^.]',
            },
          ],
        },
      ],
    },
  },
  {
    // The engine's own suites stay outside the dependency half of the boundary: they read the installed release-kit
    // build and run ESLint over a probe source, which needs Vitest, ESLint, and the filesystem. The path zone still
    // binds them, so no suite reaches into the package around it either.
    files: ['src/change-grammar/**/__tests__/**/*.ts'],
    rules: {
      'import-x/no-nodejs-modules': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-imports': 'off',
    },
  },
]);

export default config;
