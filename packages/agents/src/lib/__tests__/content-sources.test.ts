import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { artifactFrontmatterPath, type ArtifactType } from '../artifact-types.ts';
import { createSourceResolver, libraryResolver } from '../content-sources.ts';

describe(createSourceResolver, () => {
  let root: string;
  let libraryDir: string;

  beforeEach(async () => {
    root = path.join(tmpdir(), `agents-test-content-sources-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    libraryDir = path.join(root, 'library');
    await mkdir(libraryDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** Writes an empty frontmatter file for a `(type, slug)` artifact under `dir`, so `resolve` finds it. */
  async function writeArtifact(dir: string, type: ArtifactType, slug: string): Promise<void> {
    const filePath = path.join(dir, artifactFrontmatterPath(type, slug));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `---\nname: ${slug}\n---\n`, 'utf8');
  }

  it('resolves a slug from the library when no source provides it', async () => {
    await writeArtifact(libraryDir, 'rulebook', 'alpha');
    const resolver = createSourceResolver([{ name: 'org', dir: path.join(root, 'org') }], libraryDir);

    expect(await resolver.resolve('rulebook', 'alpha')).toEqual({ dir: libraryDir, source: undefined });
  });

  it('prefers a source over the library when both provide the slug', async () => {
    const orgDir = path.join(root, 'org');
    await writeArtifact(orgDir, 'rulebook', 'alpha');
    await writeArtifact(libraryDir, 'rulebook', 'alpha');
    const resolver = createSourceResolver([{ name: 'org', dir: orgDir }], libraryDir);

    expect(await resolver.resolve('rulebook', 'alpha')).toEqual({ dir: orgDir, source: 'org' });
  });

  it('resolves by declared precedence order, taking the first source that provides the slug', async () => {
    const highDir = path.join(root, 'high');
    const lowDir = path.join(root, 'low');
    await writeArtifact(highDir, 'rulebook', 'alpha');
    await writeArtifact(lowDir, 'rulebook', 'alpha');
    const resolver = createSourceResolver(
      [
        { name: 'high', dir: highDir },
        { name: 'low', dir: lowDir },
      ],
      libraryDir,
    );

    expect(await resolver.resolve('rulebook', 'alpha')).toEqual({ dir: highDir, source: 'high' });
  });

  it('returns undefined when neither a source nor the library provides the slug', async () => {
    const resolver = createSourceResolver([{ name: 'org', dir: path.join(root, 'org') }], libraryDir);

    expect(await resolver.resolve('rulebook', 'ghost')).toBeUndefined();
  });

  it('resolves a skill from a source by its directory-based frontmatter path', async () => {
    const orgDir = path.join(root, 'org');
    await writeArtifact(orgDir, 'skill', 'people-report');
    const resolver = createSourceResolver([{ name: 'org', dir: orgDir }], libraryDir);

    expect(await resolver.resolve('skill', 'people-report')).toEqual({ dir: orgDir, source: 'org' });
  });

  it('exposes libraryDir and sources as accessors for callers that need the raw search locations', () => {
    const orgDir = path.join(root, 'org');
    const resolver = createSourceResolver([{ name: 'org', dir: orgDir }], libraryDir);

    expect(resolver.libraryDir).toBe(libraryDir);
    expect(resolver.sources).toEqual([{ name: 'org', dir: orgDir }]);
  });
});

describe(libraryResolver, () => {
  it('carries no declared sources', () => {
    const resolver = libraryResolver('/library');

    expect(resolver.sources).toEqual([]);
    expect(resolver.libraryDir).toBe('/library');
  });
});
