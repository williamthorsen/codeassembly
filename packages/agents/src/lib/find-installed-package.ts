import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { isRecord } from './type-guards.ts';

/** An installed package's real directory and version. */
export interface InstalledPackage {
  readonly directory: string;
  readonly version: string;
}

/**
 * Finds the installed package `name` by walking up from `startDir` and checking
 * `node_modules/<name>/package.json` at each level: the algorithm that Node's module resolver uses.
 * The returned directory is the real path, so a further search from it follows pnpm's layout, in which
 * a package's dependencies are siblings of its real location rather than of its symlink.
 *
 * `require.resolve` is unsuitable for packages whose `exports` map does not expose `./package.json`.
 */
export async function findInstalledPackage(name: string, startDir: string): Promise<InstalledPackage> {
  let dir = startDir;
  for (;;) {
    const packageDir = path.join(dir, 'node_modules', name);
    const version = await readPackageVersion(path.join(packageDir, 'package.json'), name);
    if (version !== undefined) {
      return { directory: await realpath(packageDir), version };
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate package.json for ${name}`);
    }
    dir = parent;
  }
}

// region | Helpers

/** Reads the version from the `package.json` at `filePath` when it belongs to `name`. */
async function readPackageVersion(filePath: string, name: string): Promise<string | undefined> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    // Treat an unreadable candidate as absent and keep walking up.
    return undefined;
  }
  const parsed: unknown = JSON.parse(raw);
  return isRecord(parsed) && parsed.name === name && typeof parsed.version === 'string' ? parsed.version : undefined;
}

// endregion | Helpers
