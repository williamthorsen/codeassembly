import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES_DIR = fileURLToPath(new URL('../../packages/', import.meta.url));

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
