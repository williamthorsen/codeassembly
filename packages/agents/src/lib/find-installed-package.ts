import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { isMissingFile } from './type-guards.ts';

/** An installed package's directory, as found in `node_modules`, and its parsed `package.json`. */
export interface InstalledPackage {
  readonly directory: string;
  readonly manifest: unknown;
}

/**
 * Locates the installed directory of `name`, with its parsed `package.json`, by probing each candidate directory that
 * Node's resolver would search from `baseDir`. Probes the filesystem rather than resolving a package subpath: A modern
 * `exports` map does not expose `./package.json`, so `require.resolve` cannot reach it, and a guidance-only package
 * does not have an importable entry to resolve instead.
 *
 * The directory is the probed path, not its real path. Under pnpm a package's own dependencies are siblings of its
 * real location, so a search for them starts from the `realpath` of the result.
 */
export async function findInstalledPackage(name: string, baseDir: string): Promise<InstalledPackage | undefined> {
  for (const directory of listCandidateDirs(name, baseDir)) {
    const raw = await readFileIfPresent(path.join(directory, 'package.json'));
    if (raw !== undefined) {
      return { directory, manifest: parsePackageManifest(name, raw) };
    }
  }
  return;
}

/** Lists the candidate installed directories for `name`, in the order Node's resolver searches them from `baseDir`. */
export function listCandidateDirs(name: string, baseDir: string): ReadonlyArray<string> {
  // `createRequire` needs only a path to anchor resolution; the file itself need not exist.
  const requireFromBase = createRequire(path.join(baseDir, 'package.json'));
  // `resolve.paths` returns null for a core module, which a garbage declaration can produce; an empty candidate list
  // reports it as not installed.
  return (requireFromBase.resolve.paths(name) ?? []).map((nodeModules) => path.join(nodeModules, name));
}

// region | Helpers

/** Parses a package's `package.json` text, naming the package so that a syntax error is attributable. */
function parsePackageManifest(name: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error: unknown) {
    throw chainError(`Package "${name}" has an unreadable package.json`, error);
  }
}

/**
 * Reads `filePath`, resolving to `undefined` when it is absent. Rethrows any other failure (e.g. `EACCES` on an
 * unreadable `node_modules` directory), so a permission problem surfaces instead of reading as a bare absence and
 * sending resolution on to the next candidate.
 */
async function readFileIfPresent(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

// endregion | Helpers
