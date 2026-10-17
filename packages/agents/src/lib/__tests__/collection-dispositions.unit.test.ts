import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { artifactFrontmatterPath, type ArtifactType } from '../artifact-types.ts';
import {
  type CollectionClaim,
  type DispositionClaims,
  listPermittedReach,
  listUnclaimedArtifacts,
  readDispositionClaims,
} from '../collection-dispositions.ts';

describe(listPermittedReach, () => {
  const claims = buildClaims([
    { slug: 'recommended', disposition: 'public', members: { kind: 'explicit', edges: { skill: ['general'] } } },
    { slug: 'personal', disposition: 'personal', members: { kind: 'explicit', edges: { skill: ['mine'] } } },
    { slug: 'atlassian', disposition: 'opt-in', members: { kind: 'explicit', edges: { skill: ['jira'] } } },
    { slug: 'github', disposition: 'opt-in', members: { kind: 'explicit', edges: { skill: ['gh'] } } },
    { slug: 'bundle', disposition: undefined, members: { kind: 'explicit', edges: { skill: ['bundled'] } } },
  ]);

  it.each([
    ['recommended', ['skill:general']],
    ['personal', ['skill:general', 'skill:mine']],
    ['atlassian', ['skill:general', 'skill:jira']],
  ])('permits %s to reach %j', (slug, expected) => {
    expect([...listPermittedReach(claims, findCollection(claims, slug))].toSorted()).toEqual(expected);
  });
});

describe(listUnclaimedArtifacts, () => {
  it('leaves out dispositioned members and standalone artifacts, and keeps plain-bundle members', () => {
    const claims = buildClaims(
      [
        { slug: 'recommended', disposition: 'public', members: { kind: 'explicit', edges: { skill: ['vetted'] } } },
        { slug: 'bundle', disposition: undefined, members: { kind: 'explicit', edges: { skill: ['bundled'] } } },
      ],
      { skill: ['bundled', 'unexamined', 'vetted'], subagent: ['proof'] },
      new Map([['subagent:proof', 'exercises a mechanism']]),
    );

    expect(listUnclaimedArtifacts(claims)).toEqual({ skill: ['bundled', 'unexamined'], subagent: [] });
  });
});

describe(readDispositionClaims, () => {
  let root: string;

  beforeEach(async () => {
    root = path.join(tmpdir(), `collection-dispositions-${process.pid}-${Date.now()}`);
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads collection dispositions and standalone reasons', async () => {
    await writeArtifact(root, 'skill', 'vetted', '');
    await writeArtifact(root, 'subagent', 'proof', 'standalone: exercises a mechanism');
    await writeArtifact(root, 'collection', 'recommended', 'disposition: public\nmembers:\n  skills:\n    - vetted');

    const claims = await readDispositionClaims(root);

    expect(claims.collections).toEqual([
      { slug: 'recommended', disposition: 'public', members: { kind: 'explicit', edges: { skill: ['vetted'] } } },
    ]);
    expect([...claims.standalone]).toEqual([['subagent:proof', 'exercises a mechanism']]);
    expect(claims.problems).toEqual([]);
  });

  it('records every unreadable claim as a problem naming its file', async () => {
    await writeArtifact(root, 'skill', 'empty-reason', "standalone: ''");
    await writeArtifact(root, 'collection', 'team', 'disposition: vetted\nmembers:\n  skills:\n    - empty-reason');

    const { problems } = await readDispositionClaims(root);

    expect(problems.map(({ file }) => file).toSorted()).toEqual([
      'collections/team.md',
      'skills/empty-reason/SKILL.md',
    ]);
  });
});

// region | Helpers

/** Builds claims over a hand-written collection list, defaulting to an empty catalog and no standalone artifacts. */
function buildClaims(
  collections: ReadonlyArray<CollectionClaim>,
  catalog: DispositionClaims['catalog'] = {},
  standalone: ReadonlyMap<string, string> = new Map(),
): DispositionClaims {
  return { catalog, collections, standalone, problems: [] };
}

/** Finds a collection by slug, failing the test when it is absent. */
function findCollection(claims: DispositionClaims, slug: string): CollectionClaim {
  const found = claims.collections.find((collection) => collection.slug === slug);
  if (found === undefined) {
    throw new Error(`Fixture does not contain collection ${slug}`);
  }
  return found;
}

/** Writes an artifact whose frontmatter, after its `name:`, is `frontmatter` verbatim. */
async function writeArtifact(root: string, type: ArtifactType, slug: string, frontmatter: string): Promise<void> {
  const filePath = path.join(root, artifactFrontmatterPath(type, slug));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `---\nname: ${slug}\n${frontmatter}\n---\n\n# ${slug}\n`, 'utf8');
}

// endregion | Helpers
