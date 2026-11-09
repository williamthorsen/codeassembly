import { defineConfig } from '@williamthorsen/nmr/config';

export default defineConfig({
  // The corpus scripts measure the converter against the repository's corpus and are not part of the published package.
  build: { extraIgnorePatterns: ['**/corpus/**'] },
});
