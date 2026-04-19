import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../config/vitest.config.js';

const config = defineConfig({
  test: {
    coverage: { include: ['src/**/*.ts'] },
    environment: 'node',
    include: ['src/**/__tests__/*.test.ts', 'scripts/**/__tests__/*.test.ts'],
  },
});

export default mergeConfig(baseConfig, config);
