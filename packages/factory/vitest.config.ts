import createReactPlugin from '@vitejs/plugin-react';
import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// `plugins` is Vite-level and reaches every project through `extends: true`. `environment` and
// `setupFiles` describe what a suite collects and how it starts, so they cross the `project` seam,
// which Vitest ignores at the root once `projects` exists.
export default defineVitestConfig({
  root: { plugins: [createReactPlugin()], resolve: { tsconfigPaths: true } },
  project: { environment: 'jsdom', setupFiles: ['./vitest.setup.ts'] },
});
