import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isRecord } from './type-guards.ts';

/**
 * Reads the running package's declared version, so that a record of what a command wrote names the build that wrote it.
 */
export function readRunningPackageVersion(): string {
  const manifestPath = path.join(resolveRunningPackageRoot(), 'package.json');
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!isRecord(parsed) || typeof parsed.version !== 'string') {
    throw new Error(`Could not read a version from ${manifestPath}`);
  }
  return parsed.version;
}

/**
 * Resolves the root of the package from which this code runs: the nearest ancestor of this module holding a
 * `package.json`. The module is at `src/lib/` in a source tree and `dist/esm/lib/` in a build, and no intermediate
 * directory contains a manifest of its own, so both layouts resolve to the same root.
 */
export function resolveRunningPackageRoot(): string {
  let currentDir = path.dirname(fileURLToPath(import.meta.url));

  while (!existsSync(path.join(currentDir, 'package.json'))) {
    // `path.dirname` returns its own argument at the filesystem root, which is where the walk has run out of ancestors.
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Could not locate the running package: no package.json above ${import.meta.url}`);
    }
    currentDir = parentDir;
  }

  return currentDir;
}
