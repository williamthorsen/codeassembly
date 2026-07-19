import reactPlugin from 'eslint-plugin-react';

import baseConfig from '../../eslint.config.js';

export default [
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
        version: 'detect',
      },
    },
  },
];
