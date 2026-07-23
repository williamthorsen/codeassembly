import { defineConfig, mergeConfig } from 'vitest/config';

const gitIsolationSetupFile = new URL('vitest.setup.ts', import.meta.url).pathname;

export const baseConfig = defineConfig({
  resolve: {
    // Prefer "source" exports condition so workspace packages resolve from .ts source
    // during testing, without requiring a prior build step.
    conditions: ['source'],
    tsconfigPaths: true,
  },
  ssr: {
    resolve: {
      conditions: ['source'],
    },
  },
  test: {
    coverage: {
      enabled: false, // don't check coverage unless the `--coverage` flag is passed
      exclude: [
        '**/__{mocks,tests}__/*', //
        '**/index.ts',
        '**/mock*.{ts,tsx}',
        '**/*.d.ts',
        '**/*.types.ts',
      ],
      include: ['**/src/**/*.{ts,tsx}'],
      provider: 'v8',
    },
    exclude: ['**/node_modules/**'],
    setupFiles: [gitIsolationSetupFile],
    silent: 'passed-only', // see logs from failing tests only
    watch: false, // don't enter watch mode unless the `--watch` flag is passed
  },
});

const config = defineConfig({
  test: {
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
  },
});

export default mergeConfig(baseConfig, config);
