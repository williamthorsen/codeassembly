import { globalIgnores } from 'eslint/config';

import baseConfig from '../../eslint.config.js';

export default [
  ...baseConfig,
  // Generated esbuild bundles and shipped harness content, not lintable source.
  globalIgnores([
    'content/skills/_harnesses/**',
    'content/skills/capture-event/capture-event.mjs',
    'content/skills/derive-session-context/derive-session-context.mjs',
    'content/skills/kb-add/kb-add.mjs',
    'content/skills/kb-curate/kb-curate.mjs',
    'content/skills/kb-edit/kb-edit.mjs',
    'content/skills/kb-retrieve/kb-retrieve.mjs',
    'content/skills/update-jira-ticket/update-jira-ticket.mjs',
  ]),
];
