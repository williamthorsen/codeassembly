import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { artifactFrontmatterPath, type ArtifactType } from '../artifact-types.ts';
import { createSourceResolver, describeSearchedLocations, libraryResolver } from '../content-sources.ts';

/** True on a platform where the process can lower a directory's permissions and be blocked by them (i.e. non-root). */
const canEnforceDirPermissions = process.getuid !== undefined && process.getuid() !== 0;

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

  it.runIf(canEnforceDirPermissions)(
    'rethrows a permission error from a higher-precedence source instead of falling through to the library',
    async () => {
      const orgDir = path.join(root, 'org');
      await writeArtifact(orgDir, 'rulebook', 'alpha');
      await writeArtifact(libraryDir, 'rulebook', 'alpha');
      await chmod(orgDir, 0o000);
      const resolver = createSourceResolver([{ name: 'org', dir: orgDir }], libraryDir);

      try {
        await expect(resolver.resolve('rulebook', 'alpha')).rejects.toThrow(/EACCES/);
      } finally {
        await chmod(orgDir, 0o755);
      }
    },
  );
});

describe(describeSearchedLocations, () => {
  it('lists each declared source in precedence order, then the library, joined by the frontmatter path', () => {
    const resolver = createSourceResolver(
      [
        { name: 'high', dir: '/srcs/high' },
        { name: 'low', dir: '/srcs/low' },
      ],
      '/library',
    );

    const rulebookPath = artifactFrontmatterPath('rulebook', 'alpha');
    expect(describeSearchedLocations(resolver, 'rulebook', 'alpha')).toBe(
      [
        path.join('/srcs/high', rulebookPath),
        path.join('/srcs/low', rulebookPath),
        path.join('/library', rulebookPath),
      ].join(', '),
    );
  });

  it('lists only the library for a resolver with no declared sources', () => {
    const resolver = libraryResolver('/library');

    expect(describeSearchedLocations(resolver, 'skill', 'people-report')).toBe(
      path.join('/library', artifactFrontmatterPath('skill', 'people-report')),
    );
  });
});

describe(libraryResolver, () => {
  it('carries no declared sources', () => {
    const resolver = libraryResolver('/library');

    expect(resolver.sources).toEqual([]);
    expect(resolver.libraryDir).toBe('/library');
  });
});
