import { globalIgnores } from 'eslint/config';

import baseConfig from '../../eslint.config.js';

export default [
  ...baseConfig,
  // Generated esbuild bundles and shipped harness content, not lintable source.
  globalIgnores(['content/skills/**/*.mjs', 'content/skills/**/*-example.ts']),
];
