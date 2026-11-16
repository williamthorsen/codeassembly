import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = 'codeassembly-agent-logic';

/**
 * Returns the directory of this package's `package.json`, found by walking up from this module, so that the source and
 * the build output resolve the same root.
 */
export function findPackageRoot(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!isPackageRoot(directory)) {
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`${PACKAGE_NAME}: package.json not found above ${import.meta.url}`);
    directory = parent;
  }
  return directory;
}

/** Returns the version that this package's `package.json` declares. */
export function readPackageVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(path.join(findPackageRoot(), 'package.json'), 'utf8'));
  const version: unknown = isRecord(manifest) ? manifest['version'] : undefined;
  if (typeof version !== 'string') throw new TypeError(`${PACKAGE_NAME}: package.json does not declare a version`);
  return version;
}

// region | Helpers
function isPackageRoot(directory: string): boolean {
  const manifestPath = path.join(directory, 'package.json');
  if (!existsSync(manifestPath)) return false;
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return isRecord(manifest) && manifest['name'] === PACKAGE_NAME;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
// endregion | Helpers
