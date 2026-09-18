import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// The ancestor config that each package resolves by walking up from its own directory. Project roots
// default to the run root, so collection scopes to whichever package invoked Vitest. The repo's own
// root-level tests use `vitest.root.config.ts` instead.
//
// `tsconfigPaths` is the one resolution setting that nmr's factory leaves to the consumer. Vite defaults
// it to `false`, and this repo's tsconfigs declare `paths`.
export default defineVitestConfig({ root: { resolve: { tsconfigPaths: true } } });
