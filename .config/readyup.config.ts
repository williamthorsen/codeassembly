import { defineRdyConfig } from 'readyup';

/** Repo-level readyup settings. */
export default defineRdyConfig({
  internal: {
    infix: 'internal',
  },
  // The checks in these packages will be run by `rdy run --packages`.
  packages: [
    '@williamthorsen/eslint-config-typescript',
    '@williamthorsen/nmr',
    '@williamthorsen/release-kit',
    '@williamthorsen/toolbelt.errors',
    '@williamthorsen/toolbelt.vitest',
    'codeassembly',
    'readyup',
    'v11y-check',
  ],
});
