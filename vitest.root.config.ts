import { defineRootVitestConfig } from '@williamthorsen/nmr/vitest';

import { sharedVitestOptions } from './.config/vitest/shared-options.ts';

// Pin the monorepo root to this file's directory, so workspace exclusions hold wherever the run is
// invoked from. `monorepoRoot` rides the last layer, the only place `import.meta.dirname` names this repo.
export default defineRootVitestConfig(sharedVitestOptions, { monorepoRoot: import.meta.dirname });
