import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { isEnoent, isRecord } from '../lib/type-guards.ts';
import type { Manifest, ManifestEntry } from './types.ts';

export const MANIFEST_FILENAME = 'manifest.json';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** The outcome of reading a set's manifest. */
export type ManifestRead =
  { kind: 'missing' } | { kind: 'invalid'; message: string } | { kind: 'ok'; manifest: Manifest };

/** Returns true when `slug` is usable as a set member's identifier, a file stem, and a `db` document id. */
export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** Returns the highest-version entry of each slug, in order of first registration. */
export function listLatestEntries(manifest: Manifest): ManifestEntry[] {
  const latest = new Map<string, ManifestEntry>();
  for (const entry of manifest.entries) {
    const current = latest.get(entry.slug);
    if (current === undefined || entry.version > current.version) {
      latest.set(entry.slug, entry);
    }
  }
  return latest.values().toArray();
}

/** Returns the version that the next registration of `slug` takes: one past its highest, or 1 for a new slug. */
export function nextVersion(manifest: Manifest | null, slug: string): number {
  const entries = manifest?.entries ?? [];
  let highest = 0;
  for (const entry of entries) {
    if (entry.slug === slug && entry.version > highest) {
      highest = entry.version;
    }
  }
  return highest + 1;
}

/** Reads and validates the manifest in `setDir`. */
export async function readManifest(setDir: string): Promise<ManifestRead> {
  const manifestPath = resolveManifestPath(setDir);
  let text: string;
  try {
    text = await readFile(manifestPath, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return { kind: 'missing' };
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'invalid', message: `${manifestPath} is not valid JSON` };
  }
  if (!isManifest(parsed)) {
    return { kind: 'invalid', message: `${manifestPath} does not have the manifest layout` };
  }
  return { kind: 'ok', manifest: parsed };
}

/** Returns the path of the manifest file in `setDir`. */
export function resolveManifestPath(setDir: string): string {
  return path.join(setDir, MANIFEST_FILENAME);
}

/** Writes the manifest into `setDir` through a sibling temporary file and a rename, so that a reader never sees a partial file. */
export async function writeManifest(setDir: string, manifest: Manifest): Promise<string> {
  await mkdir(setDir, { recursive: true });
  const targetPath = resolveManifestPath(setDir);
  const tempPath = path.join(setDir, `.${MANIFEST_FILENAME}.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
  return targetPath;
}

// region | Helpers

/** Returns true when `value` has the manifest layout. */
function isManifest(value: unknown): value is Manifest {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.title === 'string' &&
    (value.indexUrl === null || typeof value.indexUrl === 'string') &&
    Array.isArray(value.entries) &&
    value.entries.every((entry) => isManifestEntry(entry))
  );
}

/** Returns true when `value` has the layout of one manifest entry. */
function isManifestEntry(value: unknown): value is ManifestEntry {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.slug === 'string' &&
    typeof value.version === 'number' &&
    Number.isSafeInteger(value.version) &&
    typeof value.registeredAt === 'string' &&
    typeof value.title === 'string' &&
    typeof value.url === 'string' &&
    isNullableString(value.source) &&
    isNullableString(value.lens) &&
    Array.isArray(value.inputs) &&
    value.inputs.every((input) => typeof input === 'string') &&
    isNullableString(value.description) &&
    isNullableString(value.shot)
  );
}

/** Returns true when `value` is a string or null. */
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

// endregion | Helpers
