import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { isEnoent, isRecord } from '../lib/type-guards.ts';
import type { Manifest, ManifestEntry, Note, PrototypeId, SetSummary } from './types.ts';

export const MANIFEST_FILENAME = 'manifest.json';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** The outcome of reading a set's manifest. */
export type ManifestRead =
  { kind: 'missing' } | { kind: 'invalid'; message: string } | { kind: 'ok'; manifest: Manifest };

/** Formats a version's id, `{number}.{version}`, which the index card and the page itself lead with. */
export function formatId(number: number, version: number): string {
  return `${number}.${version}`;
}

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

/**
 * Reads and validates the manifest in `setDir`. A manifest written before a field existed reads with that field's
 * default: numbers assigned in order of each slug's first registration, a `null` summary, and an empty list of notes.
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
  return { kind: 'ok', manifest: normalizeManifest(parsed) };
}

/**
 * Returns the id that the next registration of each slug takes, in the order given: a registered slug keeps its
 * number, and each new slug takes the next number past the set's highest, so that registering the slugs in this order
 * assigns the same ids.
 */
export function resolveIds(manifest: Manifest | null, slugs: readonly string[]): PrototypeId[] {
  const entries = manifest?.entries ?? [];
  const numbers = new Map<string, number>();
  let highest = 0;
  for (const entry of entries) {
    numbers.set(entry.slug, entry.number);
    highest = Math.max(highest, entry.number);
  }
  return slugs.map((slug) => {
    let number = numbers.get(slug);
    if (number === undefined) {
      highest += 1;
      number = highest;
      numbers.set(slug, number);
    }
    const version = nextVersion(manifest, slug);
    return { slug, number, version, id: formatId(number, version) };
  });
}

/** Returns the path of the manifest file in `setDir`. */
export function resolveManifestPath(setDir: string): string {
  return path.join(setDir, MANIFEST_FILENAME);
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

/** A manifest entry as stored on disk, whose number and notes are absent in a manifest written before they existed. */
type StoredEntry = Omit<ManifestEntry, 'notes' | 'number'> & { notes?: Note[]; number?: number };

/** A manifest as stored on disk, whose summary is absent in a manifest written before summaries existed. */
type StoredManifest = Omit<Manifest, 'entries' | 'summary'> & { entries: StoredEntry[]; summary?: SetSummary | null };

/** Returns true when `value` has the layout of one note. */
function isNote(value: unknown): value is Note {
  return isRecord(value) && typeof value.label === 'string' && typeof value.value === 'string';
}

/** Returns true when `value` is a string or null. */
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

/** Returns true when `value` has the layout of a set summary. */
function isSetSummary(value: unknown): value is SetSummary {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.shared === 'string' &&
    isNullableString(value.changes) &&
    Array.isArray(value.try) &&
    value.try.every((item) => typeof item === 'string')
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
    (value.notes === undefined || (Array.isArray(value.notes) && value.notes.every((note) => isNote(note)))) &&
    isNullableString(value.shot)
  );
}

/** Returns true when `value` has the manifest layout. */
function isStoredManifest(value: unknown): value is StoredManifest {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.title === 'string' &&
    (value.indexUrl === null || typeof value.indexUrl === 'string') &&
    (value.summary === undefined || value.summary === null || isSetSummary(value.summary)) &&
    Array.isArray(value.entries) &&
    value.entries.every((entry) => isStoredEntry(entry))
  );
}

/**
 * Fills the fields that an older manifest lacks. Every entry takes its slug's number: the number on the slug's highest
 * numbered version, or, for a slug that has none, the next number past the set's highest, in order of first
 * registration.
 */
function normalizeManifest(manifest: StoredManifest): Manifest {
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
    summary: manifest.summary ?? null,
    entries: manifest.entries.map((entry) => {
      const number = numbers.get(entry.slug);
      if (number === undefined) {
        throw new Error(`slug "${entry.slug}" was not numbered`);
      }
      return { ...entry, number, notes: entry.notes ?? [] };
    }),
  };
}

// endregion | Helpers
