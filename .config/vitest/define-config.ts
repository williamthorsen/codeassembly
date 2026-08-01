import {
  defineRootVitestConfig,
  defineVitestConfig,
  type RootVitestConfigOptions,
  type VitestConfigOptions,
} from '@williamthorsen/nmr/vitest';
import { mergeConfig, type ViteUserConfig } from 'vitest/config';

const gitIsolationSetupFile = new URL('vitest.setup.ts', import.meta.url).pathname;

// Prefer the "source" exports condition so workspace packages resolve from .ts source
// during testing, without requiring a prior build step.
const SHARED_ROOT = {
  resolve: {
    conditions: ['source'],
    tsconfigPaths: true,
  },
  ssr: {
    resolve: {
      conditions: ['source'],
    },
  },
} satisfies VitestConfigOptions['root'];

// Vitest ignores collection options at the root seam once `projects` exists, so anything
// describing what a suite collects or how it starts belongs here.
const SHARED_PROJECT = {
  setupFiles: [gitIsolationSetupFile],
} satisfies VitestConfigOptions['project'];

/** Builds the root-tests config, covering files outside the workspace packages. */
export function defineRepoRootVitestConfig(options: RootVitestConfigOptions): ViteUserConfig {
  return defineRootVitestConfig({ ...options, ...withSharedOptions(options) });
}

/** Builds a package's config. Caller options merge over the repo-wide defaults rather than replacing them. */
export function defineRepoVitestConfig(options: VitestConfigOptions = {}): ViteUserConfig {
  return defineVitestConfig(withSharedOptions(options));
}

/**
 * Layers a caller's overrides on top of the repo-wide ones. `mergeConfig` concatenates arrays, so a
 * package adding its own `setupFiles` gets them alongside the git isolation rather than in place of it.
 */
function withSharedOptions(options: VitestConfigOptions): VitestConfigOptions {
  return {
    project: mergeConfig(SHARED_PROJECT, options.project ?? {}),
    root: mergeConfig(SHARED_ROOT, options.root ?? {}),
  };
}
