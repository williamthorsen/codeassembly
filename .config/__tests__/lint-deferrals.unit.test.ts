import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { listWorkspacePackages, resolvePackagePath } from '../test-utils/workspace-packages.ts';

const DEFERRED_RULES_PATH = '.config/eslint/deferred-lint-rules.ts';
const PACKAGE_STRICT_LINT_PATH = '.config/strict-lint.config.ts';

// A deferral holds rules the shared preset sets to `error` at `warn`, where they neither block a gate nor get
// fixed. Both halves are checked, because either alone restores the mechanism: the rule list, and the
// `maxSeverity` cap that stops strict-lint promoting those warnings back to errors.
describe('lint deferrals', () => {
  it('are declared by no package', () => {
    expect(listPackagesCarrying(DEFERRED_RULES_PATH)).toEqual([]);
  });

  it('are not reintroduced as a strict-lint promotion cap', () => {
    const capping = listPackagesCarrying(PACKAGE_STRICT_LINT_PATH).filter((packageName) =>
      readFileSync(resolvePackagePath(packageName, PACKAGE_STRICT_LINT_PATH), 'utf8').includes('maxSeverity'),
    );

    expect(capping).toEqual([]);
  });
});

// region | Helpers

/** Names every workspace package holding a file at `relativePath`. */
function listPackagesCarrying(relativePath: string): string[] {
  return listWorkspacePackages().filter((packageName) => existsSync(resolvePackagePath(packageName, relativePath)));
}

// endregion | Helpers
