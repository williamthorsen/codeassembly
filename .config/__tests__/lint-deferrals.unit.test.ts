import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PACKAGES_DIR = fileURLToPath(new URL('../../packages/', import.meta.url));
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
      readFileSync(path.join(PACKAGES_DIR, packageName, PACKAGE_STRICT_LINT_PATH), 'utf8').includes('maxSeverity'),
    );

    expect(capping).toEqual([]);
  });
});

// region | Helpers

/** Names every workspace package holding a file at `relativePath`. */
function listPackagesCarrying(relativePath: string): string[] {
  return listWorkspacePackages().filter((packageName) =>
    existsSync(path.join(PACKAGES_DIR, packageName, relativePath)),
  );
}

/** Names every directory under `packages/` that holds a workspace package. */
function listWorkspacePackages(): string[] {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(PACKAGES_DIR, entry.name, 'package.json')))
    .map((entry) => entry.name)
    .toSorted();
}

// endregion | Helpers
