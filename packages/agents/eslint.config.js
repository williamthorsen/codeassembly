import { globalIgnores } from 'eslint/config';

import baseConfig from '../../eslint.config.js';

export default [
  ...baseConfig,
  // Generated esbuild bundles, not authored source.
  globalIgnores([
    'content/skills/_platforms/**',
    'content/skills/derive-session-context/derive-session-context.mjs',
    'content/skills/kb-add/kb-add.mjs',
    'content/skills/kb-retrieve/kb-retrieve.mjs',
    'content/skills/update-jira-ticket/update-jira-ticket.mjs',
  ]),
];
