import { defineRepoVitestConfig } from '../../.config/vitest/define-config.ts';

// The integration suite installs the real content catalog end to end and runs off the CI path, so it
// needs far more than the default timeout. Vitest applies project options to every category, which
// leaves the unit suite a ceiling it never approaches.
export default defineRepoVitestConfig({ project: { testTimeout: 120_000 } });
