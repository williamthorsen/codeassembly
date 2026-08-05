import { defineRootVitestConfig } from '@williamthorsen/nmr/vitest';

import { sharedVitestOptions } from './.config/vitest/shared-options.ts';

// Vitest configuration for the monorepo's root-level tests, which exclude workspace tests.
export default defineRootVitestConfig(sharedVitestOptions, { monorepoRoot: import.meta.dirname });
