import createReactPlugin from '@vitejs/plugin-react';

import { defineRepoVitestConfig } from '../../.config/vitest/define-config.ts';

// `plugins` is Vite-level and reaches every project through `extends: true`. `environment` and
// `setupFiles` describe what a suite collects and how it starts, so they cross the `project` seam,
// which Vitest ignores at the root once `projects` exists.
export default defineRepoVitestConfig({
  root: { plugins: [createReactPlugin()] },
  project: { environment: 'jsdom', setupFiles: ['./vitest.setup.ts'] },
});
