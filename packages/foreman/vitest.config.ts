import createReactPlugin from '@vitejs/plugin-react';
import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from '../../.config/vitest/vitest.config.ts';

const config = defineConfig({
  plugins: [createReactPlugin()],
  test: {
    coverage: { include: ['src/**/*.{ts,tsx}'] },
    environment: 'jsdom',
    include: ['src/**/__tests__/*.test.{ts,tsx}'],
    setupFiles: ['vitest.setup.ts'],
  },
});

export default mergeConfig(baseConfig, config);
