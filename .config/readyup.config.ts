import { defineRdyConfig } from 'readyup';

/** Repo-level readyup settings. */
export default defineRdyConfig({
  internal: {
    infix: 'internal',
  },
  packages: ['@williamthorsen/nmr', 'codeassembly'],
});
