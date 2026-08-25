import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isRecord } from './is-record.ts';

const PACKAGES_DIR = fileURLToPath(new URL('../../packages/', import.meta.url));
const ROOT_MANIFEST_PATH = fileURLToPath(new URL('../../package.json', import.meta.url));

/**
 * Names every module a package publishes as a `source` target in its `exports` map, as an absolute path.
 * A package declaring no `exports` map publishes nothing and yields an empty list.
 */
export function listExportedSourcePaths(packageName: string): string[] {
  const manifestPath = resolvePackagePath(packageName, 'package.json');
  if (!existsSync(manifestPath)) return [];

  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const exportsMap = isRecord(manifest) ? manifest['exports'] : undefined;
  if (!isRecord(exportsMap)) return [];

  return Object.values(exportsMap)
    .map(readSourceTarget)
    .filter((target) => typeof target === 'string')
    .map((target) => path.join(PACKAGES_DIR, packageName, target));
}

/** Names the repo's root manifest and every workspace package's manifest, as absolute paths, root first. */
export function listWorkspaceManifests(): string[] {
  const packageManifests = listWorkspacePackages().map((packageName) =>
    resolvePackagePath(packageName, 'package.json'),
  );

  return [ROOT_MANIFEST_PATH, ...packageManifests];
}

/** Names every directory under `packages/` that holds a workspace package. */
export function listWorkspacePackages(): string[] {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(PACKAGES_DIR, entry.name, 'package.json')))
    .map((entry) => entry.name)
    .toSorted();
}

/** Builds an absolute path to a file inside a workspace package. */
export function resolvePackagePath(packageName: string, relativePath: string): string {
  return path.join(PACKAGES_DIR, packageName, relativePath);
}

// region | Helpers

/** Reads the `source` target of one `exports` entry, which is either a bare specifier or a conditions object. */
function readSourceTarget(entry: unknown): unknown {
  if (typeof entry === 'string') return entry;

  return isRecord(entry) ? entry['source'] : undefined;
}

// endregion | Helpers
