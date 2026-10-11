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

/** Returns the number that a registration of `slug` takes: the slug's existing number, or one past the set's highest. */
export function resolveNumber(manifest: Manifest | null, slug: string): number {
  const entries = manifest?.entries ?? [];
  let highest = 0;
  for (const entry of entries) {
    if (entry.slug === slug) {
      return entry.number;
    }
    highest = Math.max(highest, entry.number);
  }
  return highest + 1;
}

/**
 * Reads and validates the manifest in `setDir`. A manifest whose entries lack numbers, written before numbers existed,
 * reads with numbers assigned in order of each slug's first registration.
 */
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
  if (!isStoredManifest(parsed)) {
    return { kind: 'invalid', message: `${manifestPath} does not have the manifest layout` };
  }
  return { kind: 'ok', manifest: numberEntries(parsed) };
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

/** A manifest entry as stored on disk, whose number is absent in a manifest written before numbers existed. */
type StoredEntry = Omit<ManifestEntry, 'number'> & { number?: number };

/** A manifest as stored on disk. */
type StoredManifest = Omit<Manifest, 'entries'> & { entries: StoredEntry[] };

/** Returns true when `value` has the manifest layout. */
function isStoredManifest(value: unknown): value is StoredManifest {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.title === 'string' &&
    (value.indexUrl === null || typeof value.indexUrl === 'string') &&
    Array.isArray(value.entries) &&
    value.entries.every((entry) => isStoredEntry(entry))
  );
}

/** Returns true when `value` has the layout of one stored manifest entry. */
function isStoredEntry(value: unknown): value is StoredEntry {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.slug === 'string' &&
    (value.number === undefined ||
      (typeof value.number === 'number' && Number.isSafeInteger(value.number) && value.number > 0)) &&
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

/**
 * Gives every entry its slug's number: the number on the slug's highest numbered version, or, for a slug that has none,
 * the next number past the set's highest, in order of first registration.
 */
function numberEntries(manifest: StoredManifest): Manifest {
  const numbered = new Map<string, { version: number; number: number }>();
  for (const entry of manifest.entries) {
    const current = numbered.get(entry.slug);
    if (entry.number !== undefined && (current === undefined || entry.version > current.version)) {
      numbered.set(entry.slug, { version: entry.version, number: entry.number });
    }
  }
  const numbers = new Map(numbered.entries().map(([slug, { number }]) => [slug, number]));
  let highest = Math.max(0, ...numbers.values());
  for (const entry of manifest.entries) {
    if (numbers.has(entry.slug)) {
      continue;
    }

    highest += 1;
    numbers.set(entry.slug, highest);
  }
  return {
    ...manifest,
    entries: manifest.entries.map((entry) => {
      const number = numbers.get(entry.slug);
      if (number === undefined) {
        throw new Error(`slug "${entry.slug}" was not numbered`);
      }
      return { ...entry, number };
    }),
  };
}

/** Returns true when `value` is a string or null. */
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

// endregion | Helpers
