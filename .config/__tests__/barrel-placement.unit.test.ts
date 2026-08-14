import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { isBarrelModule } from '../test-utils/is-barrel-module.ts';
import {
  listExportedSourcePaths,
  listWorkspacePackages,
  resolvePackagePath,
} from '../test-utils/workspace-packages.ts';

const PACKAGE_ESLINT_CONFIG_PATH = 'eslint.config.ts';

// A dormant package's layout is not held to the barrel rule. Reviving the package is what retires the exemption.
const DORMANT_PACKAGES = new Set(['factory']);

// A barrel at a lint-enforced vendor boundary is the sole permitted import site for its dependency, which makes it a
// module boundary in the same sense as a package entry point. The second test below holds each entry to that premise.
const VENDOR_BOUNDARY_BARRELS = [{ barrel: 'src/integrations/mantine/index.ts', packageName: 'foreman' }];

describe('barrel placement', () => {
  const barrels = listBarrels();

  it('finds the barrels the repo already publishes', () => {
    expect(barrels.length).toBeGreaterThan(0);
  });

  it('permits no barrel outside a package entry point', () => {
    const permitted = new Set(listPermittedBarrels());

    expect(barrels.filter((barrel) => !permitted.has(barrel))).toEqual([]);
  });

  it.each(VENDOR_BOUNDARY_BARRELS)('$packageName/$barrel serves a boundary its package still enforces', (entry) => {
    const config = readFileSync(resolvePackagePath(entry.packageName, PACKAGE_ESLINT_CONFIG_PATH), 'utf8');

    expect(config).toContain(path.dirname(entry.barrel));
  });
});

// region | Helpers

/** Names every barrel under a non-dormant package's `src/`, as an absolute path. */
function listBarrels(): string[] {
  return listWorkspacePackages()
    .filter((packageName) => !DORMANT_PACKAGES.has(packageName))
    .flatMap(listSourceIndexModules)
    .filter((modulePath) => isBarrelModule(readFileSync(modulePath, 'utf8')));
}

/** Names every barrel the rules allow: each package's `exports` entry points, plus the vendor boundaries. */
function listPermittedBarrels(): string[] {
  return [
    ...listWorkspacePackages().flatMap(listExportedSourcePaths),
    ...VENDOR_BOUNDARY_BARRELS.map((entry) => resolvePackagePath(entry.packageName, entry.barrel)),
  ];
}

/** Names every `index.ts` under a package's `src/`, as an absolute path. */
function listSourceIndexModules(packageName: string): string[] {
  const sourceDir = resolvePackagePath(packageName, 'src');
  if (!existsSync(sourceDir)) return [];

  return readdirSync(sourceDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === 'index.ts')
    .map((entry) => path.join(entry.parentPath, entry.name));
}

// endregion | Helpers
