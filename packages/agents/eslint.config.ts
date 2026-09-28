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
      // The package ships a CLI but not an importable surface: Its empty `exports` forecloses deep imports into the
      // build output, leaving the rule without a root export to style.
      'package-json/exports-subpaths-style': 'off',
    },
  },
  {
    // The change-grammar engine is written to move to another repository unchanged, so it depends on nothing but
    // itself: It does not import any module outside its directory, any package, or any Node builtin, and it does not
    // read `process`. The engine takes the taxonomy as an argument.
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
        { message: 'The change-grammar engine does not read the ambient environment.', name: 'process' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              message:
                'The change-grammar engine does not depend on any package, so it carries none to a repository that it moves to.',
              regex: '^[^.]',
            },
          ],
        },
      ],
    },
  },
  {
    // The engine's own suites stay outside the dependency half of the boundary: They read the installed release-kit
    // build and run ESLint over a probe source, which needs Vitest, ESLint, and the filesystem. Because the path zone
    // still binds them, the suites do not reach into the package around it either.
    files: ['src/change-grammar/**/__tests__/**/*.ts'],
    rules: {
      'import-x/no-nodejs-modules': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-imports': 'off',
    },
  },
]);

export default config;
