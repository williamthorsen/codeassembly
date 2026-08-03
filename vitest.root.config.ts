import { defineRepoRootVitestConfig } from './.config/vitest/define-config.ts';

// Pin the monorepo root to this file's directory, so workspace exclusions hold wherever the run is invoked from.
export default defineRepoRootVitestConfig({ monorepoRoot: import.meta.dirname });
