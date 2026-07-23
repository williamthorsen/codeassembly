import { defineConfig, mergeConfig } from 'vitest/config';

import { baseConfig } from '../../.config/vitest/vitest.config.ts';
import { integrationTestPatterns } from '../../.config/vitest/vitest.integration.config.ts';

// Deliberate-only run for `*.int.test.ts` (real-library / full-install tests). Built from the root base
// config — which carries no `include` — so the integration `include` selects only `*.int.test.ts` rather
// than concatenating with the package's default `include` (vitest `mergeConfig` concatenates arrays).
// The timeout is wide because these install the real catalog end-to-end and run off the CI path.
const config = defineConfig({
  test: {
    coverage: { include: ['src/**/*.ts'] },
    environment: 'node',
    include: integrationTestPatterns,
    testTimeout: 120_000,
  },
});

export default mergeConfig(baseConfig, config);
