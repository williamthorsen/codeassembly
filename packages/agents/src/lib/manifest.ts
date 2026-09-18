import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { hasAmbientRegion, stripAmbientRegionContent } from './ambient-region.ts';
import { isRecord } from './type-guards.ts';
import type { AgentsManifest, ManifestEntry } from './types.ts';

/** Home of the retired cross-harness guidance tier, relative to the user's home. */
const SHARED_HOME_DIR = '.agents';

/** Narrows a parsed value to a manifest of the current schema shape. */
function isAgentsManifest(value: unknown): value is AgentsManifest {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.schemaVersion === 'number' && isRecord(value.harnesses);
}

/** Default manifest directory relative to home. */
const MANIFEST_DIR = '.codeassembly';
const MANIFEST_FILENAME = 'agents-manifest.json';

/** Returns the default manifest file path, under `baseDir` or the home directory. */
export function getManifestPath(baseDir?: string): string {
  const home = baseDir ?? homedir();
  return path.join(home, MANIFEST_DIR, MANIFEST_FILENAME);
}

/** Creates an empty manifest with the current schema version. */
export function createEmptyManifest(): AgentsManifest {
  return {
    schemaVersion: 2,
    harnesses: {},
  };
}

/**
 * Resolves the absolute path to `~/.agents/`, the retired cross-harness guidance tier that the retirement pass
 * removes.
 */
export function resolveSharedHome(baseDir?: string): string {
  const home = baseDir ?? homedir();
  return path.join(home, SHARED_HOME_DIR);
}

/** Reads the manifest from disk. Returns an empty manifest if the file does not exist. */
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

/** Writes the manifest to disk, creating the directory if necessary. */
export async function writeManifest(manifestPath: string, manifest: AgentsManifest): Promise<void> {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

/**
 * Computes the SHA-256 content hash of a file. Content inside an ambient region is excluded before hashing, so a
 * sync-written region never reads as user drift; files without region markers hash over their raw bytes unchanged.
 * The digest is returned prefixed with `sha256:`.
 */
export async function computeContentHash(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  const text = content.toString('utf8');
  const hash = createHash('sha256')
    .update(hasAmbientRegion(text) ? stripAmbientRegionContent(text) : content)
    .digest('hex');
  return `sha256:${hash}`;
}

/** Detects whether an installed file has drifted from its manifest entry. */
export async function detectDrift(
  entry: ManifestEntry,
  harnessHome: string,
): Promise<'current' | 'modified' | 'missing'> {
  const filePath = path.join(harnessHome, entry.relativePath);

  if (!existsSync(filePath)) {
    return 'missing';
  }

  // A directory entry carries a sentinel hash and cannot be content-hashed, so its presence is the whole check.
  if (entry.contentHash.startsWith('sha256:dir:')) {
    const stats = await stat(filePath);
    return stats.isDirectory() ? 'current' : 'modified';
  }

  const currentHash = await computeContentHash(filePath);
  return currentHash === entry.contentHash ? 'current' : 'modified';
}
