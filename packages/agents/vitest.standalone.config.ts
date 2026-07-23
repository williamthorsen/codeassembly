import { defineConfig, mergeConfig } from 'vitest/config';

import { integrationTestPatterns } from '../../.config/vitest/vitest.integration.config.ts';
import baseConfig from './vitest.config.js';

// Default test run: everything the base config selects, minus the deliberate-only `*.int.test.ts` tests.
const config = defineConfig({
  test: {
    exclude: integrationTestPatterns,
  },
});

export default mergeConfig(baseConfig, config);
