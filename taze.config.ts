import { defineConfig } from '@williamthorsen/nmr/taze';

export default defineConfig({
  // Hold packages that must track a particular version line, so an upgrade pass never jumps them.
  packageMode: {
    // Disallow major upgrades until the pinned Node.js version is changed; engines is set to >=24.
    '@types/node': 'minor',
    // Hold typescript at v6 until v7 supports type-aware linting.
    typescript: 'minor',
    // Hold vitest at v4 until v5 matures.
    '@vitest/coverage-v8': 'minor',
    vitest: 'minor',
  },
});
