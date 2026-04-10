import { defineRdyConfig } from 'readyup';

/** Repo-level readyup settings. */
export default defineRdyConfig({
  compile: {
    srcDir: '.rdy/kits',
    outDir: '.rdy/kits',
  },
  internal: {
    dir: 'internal',
  },
});
