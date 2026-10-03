import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { isValidSlug, listLatestEntries, nextVersion, readManifest, writeManifest } from '../manifest.ts';
import type { Manifest, ManifestEntry } from '../types.ts';

describe(isValidSlug, () => {
  it.each(['a', 'warm-palette', '0x', 'a'.repeat(40)])('accepts %s', (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each(['', '-lead', 'Upper', 'under_score', 'dot.ted', 'a'.repeat(41), '../escape'])('refuses %s', (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });
});

describe(nextVersion, () => {
  it('starts a new slug at 1', () => {
    expect(nextVersion(null, 'a')).toBe(1);
    expect(nextVersion(buildManifest([buildEntry('b', 3)]), 'a')).toBe(1);
  });

  it('increments past the highest version of the slug', () => {
    expect(nextVersion(buildManifest([buildEntry('a', 1), buildEntry('a', 2)]), 'a')).toBe(3);
  });
});

describe(listLatestEntries, () => {
  it('keeps the highest version of each slug in first-registration order', () => {
    const manifest = buildManifest([buildEntry('a', 1), buildEntry('b', 1), buildEntry('a', 2)]);

    expect(listLatestEntries(manifest).map((entry) => [entry.slug, entry.version])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
  });
});

describe(readManifest, () => {
  it('reports a missing manifest', async () => {
    const setDir = await mkdtemp(path.join(tmpdir(), 'index-prototypes-manifest-'));

    await expect(readManifest(setDir)).resolves.toEqual({ kind: 'missing' });
  });

  it('reports a manifest that is not JSON', async () => {
    const setDir = await mkdtemp(path.join(tmpdir(), 'index-prototypes-manifest-'));
    await writeFile(path.join(setDir, 'manifest.json'), '{', 'utf8');

    await expect(readManifest(setDir)).resolves.toMatchObject({ kind: 'invalid' });
  });

  it('reports a manifest whose entry lacks a field', async () => {
    const setDir = await mkdtemp(path.join(tmpdir(), 'index-prototypes-manifest-'));
    const { downsized: _omitted, ...partial } = buildEntry('a', 1);
    await writeFile(
      path.join(setDir, 'manifest.json'),
      JSON.stringify({ title: 'T', indexUrl: null, entries: [partial] }),
      'utf8',
    );

    await expect(readManifest(setDir)).resolves.toMatchObject({ kind: 'invalid' });
  });

  it('round-trips a written manifest without leaving a temporary file', async () => {
    const setDir = await mkdtemp(path.join(tmpdir(), 'index-prototypes-manifest-'));
    const manifest = buildManifest([buildEntry('a', 1)]);

    const written = await writeManifest(setDir, manifest);

    await expect(readManifest(setDir)).resolves.toEqual({ kind: 'ok', manifest });
    expect(JSON.parse(await readFile(written, 'utf8'))).toEqual(manifest);
    expect(await readdir(setDir)).toEqual(['manifest.json']);
  });
});

// region | Helpers

/** Builds a manifest entry with fixed metadata. */
function buildEntry(slug: string, version: number): ManifestEntry {
  return {
    slug,
    version,
    registeredAt: '2026-10-03T01:00:00.000Z',
    title: `Prototype ${slug}`,
    url: `https://claude.ai/artifact/${slug}`,
    source: null,
    lens: null,
    inputs: [],
    description: null,
    shot: null,
    downsized: false,
  };
}

/** Builds a manifest around `entries`. */
function buildManifest(entries: ManifestEntry[]): Manifest {
  return { title: 'Set', indexUrl: null, entries };
}

// endregion | Helpers
