import { defineConfig } from '@williamthorsen/nmr/taze';

export default defineConfig({
  // Propose first-party releases once they clear pnpm's 24-hour minimumReleaseAge; third-party ones keep the 7-day default.
  packageMaturityPeriod: {
    '@williamthorsen/*': 1,
    readyup: 1,
    'v11y-check': 1,
  },
  // Hold packages that must track a particular version line, so that an upgrade pass never moves them off it.
  packageMode: {
    // Disallow major upgrades until the pinned Node.js version is changed; engines is set to >=24.
    '@types/node': 'minor',
    // Hold typescript at v6 until v7 supports type-aware linting.
    typescript: 'minor',
  },
});
