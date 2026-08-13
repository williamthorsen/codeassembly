import { defineConfig } from 'eslint/config';
import reactPlugin from 'eslint-plugin-react';

import baseConfig from '../../eslint.config.ts';

const config = defineConfig([
  ...baseConfig,
  {
    // This package's specifiers name `.js` files for its `.ts` modules, so the honest-extension rule is off here.
    rules: {
      'import/extensions': 'off',
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
