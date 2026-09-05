import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { listWorkspacePackages, resolvePackagePath } from '../test-utils/workspace-packages.ts';

const PACKAGE_CONFIG_PATH = 'eslint.config.ts';
const ROOT_CONFIG_SPECIFIER = '../../eslint.config.ts';

// The root config carries the `import-x/resolver-next` settings that `eslint-plugin-import-x` reads. A package
// config importing the shared preset directly still runs `import-x/extensions` at `error`, but with nothing to
// resolve against the rule accepts a `.js` specifier naming a `.ts` file.
describe('package ESLint configs', () => {
  it.each(listWorkspacePackages())('%s extends the root config', (packageName) => {
    const configPath = resolvePackagePath(packageName, PACKAGE_CONFIG_PATH);

    expect(existsSync(configPath), `packages/${packageName}/${PACKAGE_CONFIG_PATH} does not exist`).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toContain(ROOT_CONFIG_SPECIFIER);
  });
});
