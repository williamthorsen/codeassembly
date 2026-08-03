import { fileURLToPath } from 'node:url';

import type { VitestConfigOptions } from '@williamthorsen/nmr/vitest';

// Absolute, because Vitest resolves `setupFiles` against each project's own root rather than against the
// module declaring the path. A relative path here would name a different file in every package.
const gitIsolationSetupFile = fileURLToPath(new URL('vitest.setup.ts', import.meta.url));

/**
 * Settings every config file in this repo layers in, covering the two things nmr's factory leaves to the
 * consumer. A config file that omits this layer loses them silently, which is what the guard beside this
 * module catches.
 */
export const sharedVitestOptions: VitestConfigOptions = {
  // Prefer the "source" exports condition so workspace packages resolve from .ts source
  // during testing, without requiring a prior build step.
  root: {
    resolve: {
      conditions: ['source'],
      tsconfigPaths: true,
    },
    ssr: {
      resolve: {
        conditions: ['source'],
      },
    },
  },
  // Vitest ignores collection options at the root seam once `projects` exists, so anything
  // describing what a suite collects or how it starts belongs here.
  project: {
    setupFiles: [gitIsolationSetupFile],
  },
};
