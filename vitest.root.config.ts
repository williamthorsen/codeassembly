import { defineRootVitestConfig } from '@williamthorsen/nmr/vitest';

export default defineRootVitestConfig({
  monorepoRoot: import.meta.dirname,
  root: { resolve: { tsconfigPaths: true } },
});
