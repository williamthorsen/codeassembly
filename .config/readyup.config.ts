import { defineRdyConfig } from 'readyup';

/** Repo-level readyup settings. */
export default defineRdyConfig({
  internal: {
    infix: 'internal',
  },
  // The checks in these packages will be run by `rdy run --packages`.
  packages: ['@williamthorsen/nmr', '@williamthorsen/release-kit', 'v11y-check'],
});
