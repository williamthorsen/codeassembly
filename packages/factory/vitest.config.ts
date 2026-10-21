import createReactPlugin from '@vitejs/plugin-react';
import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// `plugins` is Vite-level and reaches every project through `extends: true`. `environment` and
// `setupFiles` describe what a suite collects and how it starts, so they cross the `project` seam,
// which Vitest ignores at the root once `projects` exists. The environment is `node`; a file that
// renders into a DOM opts into happy-dom with a `// @vitest-environment happy-dom` pragma, because a
// DOM's start-up costs more than most suites here take to run.
export default defineVitestConfig({
  root: { plugins: [createReactPlugin()] },
  project: { environment: 'node', setupFiles: ['./vitest.setup.ts'] },
});
