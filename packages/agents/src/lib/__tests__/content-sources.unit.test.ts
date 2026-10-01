import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { artifactFrontmatterPath, type ArtifactType } from '../artifact-types.ts';
import {
  createSourceResolver,
  describeSearchedLocations,
  findShadowedSources,
  type SourceResolver,
} from '../content-sources.ts';

/** True on a platform where the process can lower a directory's permissions and be blocked by them (i.e. non-root). */
const canEnforceDirPermissions = process.getuid !== undefined && process.getuid() !== 0;

describe(createSourceResolver, () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempRoot('content-sources');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resolves by declared precedence order, taking the first source that provides the slug', async () => {
    const highDir = path.join(root, 'high');
    const lowDir = path.join(root, 'low');
    await writeArtifact(highDir, 'rulebook', 'alpha');
    await writeArtifact(lowDir, 'rulebook', 'alpha');
    const resolver = createSourceResolver([
      { name: 'high', dir: highDir },
      { name: 'low', dir: lowDir },
    ]);

    expect(await resolver.resolve('rulebook', 'alpha')).toEqual({ dir: highDir, source: 'high' });
  });

  it('falls through to a lower-precedence source when a higher one does not provide the slug', async () => {
    const highDir = path.join(root, 'high');
    const lowDir = path.join(root, 'low');
    await mkdir(highDir, { recursive: true });
    await writeArtifact(lowDir, 'rulebook', 'alpha');
    const resolver = createSourceResolver([
      { name: 'high', dir: highDir },
      { name: 'low', dir: lowDir },
    ]);

    expect(await resolver.resolve('rulebook', 'alpha')).toEqual({ dir: lowDir, source: 'low' });
  });

  it('returns undefined when no declared source provides the slug', async () => {
    const resolver = createSourceResolver([{ name: 'org', dir: path.join(root, 'org') }]);

    expect(await resolver.resolve('rulebook', 'ghost')).toBeUndefined();
  });

  it('resolves a skill from a source by its directory-based frontmatter path', async () => {
    const orgDir = path.join(root, 'org');
    await writeArtifact(orgDir, 'skill', 'people-report');
    const resolver = createSourceResolver([{ name: 'org', dir: orgDir }]);

    expect(await resolver.resolve('skill', 'people-report')).toEqual({ dir: orgDir, source: 'org' });
  });

  it('exposes sources as an accessor for callers that need the raw search locations', () => {
    const orgDir = path.join(root, 'org');
    const resolver = createSourceResolver([{ name: 'org', dir: orgDir }]);

    expect(resolver.sources).toEqual([{ name: 'org', dir: orgDir }]);
  });

  it.runIf(canEnforceDirPermissions)(
    'rethrows a permission error from a higher-precedence source instead of falling through to a lower one',
    async () => {
      const orgDir = path.join(root, 'org');
      const lowDir = path.join(root, 'low');
      await writeArtifact(orgDir, 'rulebook', 'alpha');
      await writeArtifact(lowDir, 'rulebook', 'alpha');
      await chmod(orgDir, 0o000);
      const resolver = createSourceResolver([
        { name: 'org', dir: orgDir },
        { name: 'low', dir: lowDir },
      ]);

      try {
        await expect(resolver.resolve('rulebook', 'alpha')).rejects.toThrow(/EACCES/);
      } finally {
        await chmod(orgDir, 0o755);
      }
    },
  );
});

describe(describeSearchedLocations, () => {
  it('lists each declared source in precedence order, joined by the frontmatter path', () => {
    const resolver = createSourceResolver([
      { name: 'high', dir: '/srcs/high' },
      { name: 'low', dir: '/srcs/low' },
    ]);

    const rulebookPath = artifactFrontmatterPath('rulebook', 'alpha');
    expect(describeSearchedLocations(resolver, 'rulebook', 'alpha')).toBe(
      [path.join('/srcs/high', rulebookPath), path.join('/srcs/low', rulebookPath)].join(', '),
    );
  });

  it('lists the single declared source of a one-source resolver and nothing else', () => {
    const resolver = createSourceResolver([{ name: 'only', dir: '/srcs/only' }]);

    expect(describeSearchedLocations(resolver, 'skill', 'people-report')).toBe(
      path.join('/srcs/only', artifactFrontmatterPath('skill', 'people-report')),
    );
  });
});

describe(findShadowedSources, () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempRoot('shadowed-sources');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** Builds a resolver over one source per name under `root`, in the given precedence order. */
  function buildResolver(names: ReadonlyArray<string>): SourceResolver {
    return createSourceResolver(names.map((name) => ({ name, dir: path.join(root, name) })));
  }

  it('names every lower-precedence source that also ships the slug, in precedence order', async () => {
    for (const name of ['high', 'mid', 'low']) {
      await writeArtifact(path.join(root, name), 'rulebook', 'alpha');
    }

    expect(await findShadowedSources(buildResolver(['high', 'mid', 'low']), 'rulebook', 'alpha', 'high')).toEqual([
      'mid',
      'low',
    ]);
  });

  it('ignores a higher-precedence source than the winner even when it ships the slug', async () => {
    for (const name of ['high', 'mid', 'low']) {
      await writeArtifact(path.join(root, name), 'rulebook', 'alpha');
    }

    expect(await findShadowedSources(buildResolver(['high', 'mid', 'low']), 'rulebook', 'alpha', 'mid')).toEqual([
      'low',
    ]);
  });

  it('leaves out a lower-precedence source that does not ship the slug', async () => {
    await writeArtifact(path.join(root, 'high'), 'skill', 'alpha');
    await writeArtifact(path.join(root, 'mid'), 'skill', 'beta');
    await writeArtifact(path.join(root, 'low'), 'skill', 'alpha');

    expect(await findShadowedSources(buildResolver(['high', 'mid', 'low']), 'skill', 'alpha', 'high')).toEqual(['low']);
  });

  it('distinguishes artifact types, so a lower source shipping the slug as another type is not shadowed', async () => {
    await writeArtifact(path.join(root, 'high'), 'rulebook', 'alpha');
    await writeArtifact(path.join(root, 'low'), 'skill', 'alpha');

    expect(await findShadowedSources(buildResolver(['high', 'low']), 'rulebook', 'alpha', 'high')).toEqual([]);
  });

  it('returns an empty list when the winner is the lowest-precedence source', async () => {
    await writeArtifact(path.join(root, 'high'), 'rulebook', 'alpha');
    await writeArtifact(path.join(root, 'low'), 'rulebook', 'alpha');

    expect(await findShadowedSources(buildResolver(['high', 'low']), 'rulebook', 'alpha', 'low')).toEqual([]);
  });
});

// region | Helpers

/** Creates a unique temporary directory for one test. */
async function createTempRoot(label: string): Promise<string> {
  const root = path.join(tmpdir(), `agents-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(root, { recursive: true });
  return root;
}

/** Writes an empty frontmatter file for a `(type, slug)` artifact under `dir`, so that `resolve` finds it. */
async function writeArtifact(dir: string, type: ArtifactType, slug: string): Promise<void> {
  const filePath = path.join(dir, artifactFrontmatterPath(type, slug));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `---\nname: ${slug}\n---\n`, 'utf8');
}

// endregion | Helpers
