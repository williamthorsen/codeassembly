import { defineConfig } from 'eslint/config';
import reactPlugin from 'eslint-plugin-react';

import baseConfig from '../../eslint.config.ts';

const config = defineConfig([
  ...baseConfig,
  {
    files: ['src/**'],
    ignores: ['src/integrations/mantine/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@mantine/*'],
              message: 'Import Mantine through src/integrations/mantine, the sole vendor boundary.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.tsx'],
    languageOptions: {
      globals: {
        JSX: 'readonly',
      },
    },
    plugins: {
      react: reactPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      'no-undef': 'off',
      'react/react-in-jsx-scope': 'off',
    },
    settings: {
      react: {
        // Pin the version: eslint-plugin-react's `detect` path calls the eslint 9 `context.getFilename()`,
        // removed in eslint 10, which throws while loading React rules.
        version: '19.2.8',
      },
    },
  },
]);

export default config;
