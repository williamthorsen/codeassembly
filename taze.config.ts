import { defineConfig } from '@williamthorsen/nmr/taze';

export default defineConfig({
  // Hold packages that must track a particular version line, so that an upgrade pass never moves them off it.
  packageMode: {
    // Disallow major upgrades until the pinned Node.js version is changed; engines is set to >=24.
    '@types/node': 'minor',
    // Hold typescript at v6 until v7 supports type-aware linting.
    typescript: 'minor',
  },
});
