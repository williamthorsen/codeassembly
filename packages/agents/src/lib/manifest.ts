import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import type { AgentsManifest, ManifestEntry } from './types.js';

/**
 * Type guard for AgentsManifest.
 */
function isAgentsManifest(value: unknown): value is AgentsManifest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    'schemaVersion' in value &&
    typeof value.schemaVersion === 'number' &&
    'platforms' in value &&
    typeof value.platforms === 'object' &&
    value.platforms !== null
  );
}

/** Default manifest directory relative to home. */
const MANIFEST_DIR = '.codeassembly';
const MANIFEST_FILENAME = 'agents-manifest.json';

/**
 * Returns the default manifest file path.
 * @param baseDir Override for the home directory (defaults to `os.homedir()`).
 */
export function getManifestPath(baseDir?: string): string {
  const home = baseDir ?? homedir();
  return path.join(home, MANIFEST_DIR, MANIFEST_FILENAME);
}

/**
 * Creates an empty manifest with the current schema version.
 */
export function createEmptyManifest(): AgentsManifest {
  return {
    schemaVersion: 1,
    platforms: {},
  };
}

/**
 * Reads the manifest from disk. Returns an empty manifest if the file does not exist.
 * @param manifestPath Absolute path to the manifest file.
 */
export async function readManifest(manifestPath: string): Promise<AgentsManifest> {
  if (!existsSync(manifestPath)) {
    return createEmptyManifest();
  }

  const content = await readFile(manifestPath, 'utf8');
  const parsed: unknown = JSON.parse(content);

  if (!isAgentsManifest(parsed)) {
    console.warn('Warning: existing manifest is invalid or incompatible. Existing installation records will be reset.');
    return createEmptyManifest();
  }

  return parsed;
}

/**
 * Writes the manifest to disk, creating the directory if necessary.
 * @param manifestPath Absolute path to the manifest file.
 * @param manifest The manifest data to write.
 */
export async function writeManifest(manifestPath: string, manifest: AgentsManifest): Promise<void> {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

/**
 * Computes the SHA-256 content hash of a file.
 * @param filePath Absolute path to the file.
 * @returns Hash string prefixed with `sha256:`.
 */
export async function computeContentHash(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  const hash = createHash('sha256').update(content).digest('hex');
  return `sha256:${hash}`;
}

/**
 * Detects whether an installed file has drifted from its manifest entry.
 * @param entry The manifest entry to check.
 * @param platformHome Absolute path to the platform's home directory.
 * @returns `'current'` if unchanged, `'modified'` if changed, `'missing'` if deleted.
 */
export async function detectDrift(
  entry: ManifestEntry,
  platformHome: string,
): Promise<'current' | 'modified' | 'missing'> {
  const filePath = path.join(platformHome, entry.relativePath);

  if (!existsSync(filePath)) {
    return 'missing';
  }

  // Directory entries use a sentinel hash and cannot be content-hashed.
  // If the directory exists, consider it current.
  if (entry.contentHash.startsWith('sha256:dir:')) {
    const stats = await stat(filePath);
    return stats.isDirectory() ? 'current' : 'modified';
  }

  const currentHash = await computeContentHash(filePath);
  return currentHash === entry.contentHash ? 'current' : 'modified';
}
