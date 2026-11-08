import createReactPlugin from '@vitejs/plugin-react';
import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// The React plugin is Vite-level, so it reaches every project. A component test selects happy-dom in its own docblock, so
// that the server and CLI tests keep the Node environment.
export default defineVitestConfig({
  root: { plugins: [createReactPlugin()] },
  project: { setupFiles: ['./vitest.setup.ts'] },
});
