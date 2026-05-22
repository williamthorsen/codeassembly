import { globalIgnores } from 'eslint/config';

import baseConfig from '../../eslint.config.js';

export default [
  ...baseConfig,
  // `content/skills/kb-retrieve/kb-retrieve.mjs` is a generated esbuild bundle, not authored source.
  globalIgnores(['content/skills/_platforms/**', 'content/skills/kb-retrieve/kb-retrieve.mjs']),
];
