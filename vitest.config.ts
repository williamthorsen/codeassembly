import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// The config that `nmr-vitest` names for each package without a config of its own. Project roots default to the
// run root, so collection scopes to whichever package invoked Vitest. The repo's own root-level tests use
// `vitest.root.config.ts` instead.
export default defineVitestConfig();
