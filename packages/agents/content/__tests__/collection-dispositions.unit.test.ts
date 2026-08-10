import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ARTIFACT_TYPE_VALUES, ARTIFACT_TYPES } from '../../src/lib/artifact-types.ts';
import { resolveContentDir } from '../../src/lib/content-resolver.ts';
import { libraryResolver } from '../../src/lib/content-sources.ts';
import { type ArtifactDependencies, readMembers } from '../../src/lib/dependency-frontmatter.ts';
import { resolveClosure, type ResolvedClosure } from '../../src/lib/dependency-resolver.ts';
import { listVisibleMarkdownFiles } from '../../src/lib/fs-helpers.ts';
import { enumerateCatalogSlugs } from '../../src/lib/library-catalog.ts';

// Declaring a collection is a claim about its members, so an artifact in none of them is deploying under a claim
// nobody made. These two checks are what make the claim real rather than nominal: coverage catches the artifact that
// slipped in with no disposition, and closure catches the unexamined artifact that a vetted collection reaches through
// an edge. Neither can be replaced by reading the collection files, because both defects are invisible there.

/** An artifact addressed as `<type>:<slug>`, the form the resolver's own errors use. */
type ArtifactId = string;

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures', 'collection-dispositions');

/** The pseudo-collection a standalone artifact carries, so one map answers "what claims does this hold?". */
const STANDALONE_DISPOSITION = 'standalone';

/** The collection holding what nobody has examined; its membership tolerates no vetted co-claim. */
const TRIAGE_DISPOSITION = 'triage';

/**
 * The artifacts belonging to no collection, each with the reason it stands alone. Recorded here so the coverage check
 * reads an absence as a decision; an artifact missing from both this record and every collection is the oversight the
 * check exists to catch.
 */
const STANDALONE: Readonly<Record<ArtifactId, string>> = {
  'rulebook:codeassembly-content-specification': 'governs this repository alone, which declares it directly',
  'skill:migrate-feedback-memories': 'wanted once per machine, too rarely to repay a standing skill-index line',
  'subagent:canary': 'proves the declared-subagent mechanism rather than doing work of its own',
};

/** Each vetted collection and the dispositions its closure may reach. A collection absent here claims no vetting. */
const VETTED_CLOSURES: ReadonlyArray<{ collection: string; reaches: ReadonlyArray<string> }> = [
  { collection: 'recommended', reaches: ['recommended'] },
  { collection: 'williamthorsen', reaches: ['recommended', 'williamthorsen'] },
];

/** The vetted collections' slugs, derived from the reach table. */
const VETTED_COLLECTIONS: ReadonlyArray<string> = VETTED_CLOSURES.map(({ collection }) => collection);

/**
 * Every claim that records a disposition. Membership in a collection outside this set is a plain-bundle claim: it
 * says nothing about the artifact, so it neither satisfies coverage nor conflicts with any disposition.
 */
const DISPOSITIONS: ReadonlySet<string> = new Set([...VETTED_COLLECTIONS, STANDALONE_DISPOSITION, TRIAGE_DISPOSITION]);

describe('collection dispositions', () => {
  const contentDir = resolveContentDir();

  it('gives every library artifact a disposition', async () => {
    const [catalog, collections] = await Promise.all([
      enumerateCatalogSlugs(contentDir),
      readExplicitCollections(contentDir),
    ]);

    expect(findCoverageDefects(catalog, collections, Object.keys(STANDALONE))).toEqual([]);
  });

  it.each(VETTED_CLOSURES)('keeps $collection closed over its own disposition', async ({ collection, reaches }) => {
    const collections = await readExplicitCollections(contentDir);
    const closure = await resolveClosure({ collection: [collection] }, libraryResolver(contentDir));

    const defects = findClosureDefects(
      collection,
      listClosureIds(closure),
      reaches,
      buildClaimMap(collections, Object.keys(STANDALONE)),
    );

    expect(defects).toEqual([]);
  });

  // What standalone buys is a skill-index line nobody pays for unless they ask, and that survives only while no
  // collection's closure reaches the artifact. `triage` is the 71-member surface where a new edge is likeliest, and
  // it is constrained by no vetted-closure rule.
  it('keeps every standalone artifact out of the collections’ combined closure', async () => {
    const collections = await readExplicitCollections(contentDir);
    const closure = await resolveClosure({ collection: [...collections.keys()] }, libraryResolver(contentDir));

    const defects = findClosureDefects(
      'every collection',
      listClosureIds(closure),
      [...collections.keys()],
      buildClaimMap(collections, Object.keys(STANDALONE)),
    );

    expect(defects).toEqual([]);
  });

  it('records a standalone reason for every artifact it exempts', () => {
    expect(Object.values(STANDALONE).filter((reason) => reason.length === 0)).toEqual([]);
  });

  describe('coverage', () => {
    it('reports an artifact no collection claims', async () => {
      const fixtureDir = path.join(FIXTURES_DIR, 'uncovered');
      const [catalog, collections] = await Promise.all([
        enumerateCatalogSlugs(fixtureDir),
        readExplicitCollections(fixtureDir),
      ]);

      expect(findCoverageDefects(catalog, collections, [])).toEqual([
        'skill:orphan carries no disposition; add it to a collection, or record it standalone with the reason.',
      ]);
    });

    it('accepts an artifact two vetted collections claim', () => {
      const collections = new Map([
        ['recommended', { skill: ['shared'] }],
        ['williamthorsen', { skill: ['shared'] }],
      ]);

      expect(findCoverageDefects({ skill: ['shared'] }, collections, [])).toEqual([]);
    });

    it('accepts a triage artifact a plain bundle also claims', () => {
      const collections = new Map([
        ['bitbucket', { skill: ['unexamined'] }],
        ['triage', { skill: ['unexamined'] }],
      ]);

      expect(findCoverageDefects({ skill: ['unexamined'] }, collections, [])).toEqual([]);
    });

    it('reports an artifact only a plain bundle claims', () => {
      const collections = new Map([['bitbucket', { skill: ['unexamined'] }]]);

      expect(findCoverageDefects({ skill: ['unexamined'] }, collections, [])).toEqual([
        'skill:unexamined carries no disposition; add it to a collection, or record it standalone with the reason.',
      ]);
    });

    it('reports a standalone record on an artifact a collection claims', () => {
      const collections = new Map([['triage', { skill: ['contested'] }]]);

      expect(findCoverageDefects({ skill: ['contested'] }, collections, ['skill:contested'])).toEqual([
        'skill:contested is recorded standalone yet claimed by triage; standalone means membership in no collection.',
      ]);
    });

    it('reports an artifact in both triage and a vetted collection', () => {
      const collections = new Map([
        ['recommended', { skill: ['half-promoted'] }],
        ['triage', { skill: ['half-promoted'] }],
      ]);

      expect(findCoverageDefects({ skill: ['half-promoted'] }, collections, [])).toEqual([
        'skill:half-promoted is in both triage and recommended; promotion moves an artifact out of triage.',
      ]);
    });

    it('reports a claim on an artifact the library no longer holds', () => {
      const collections = new Map([['triage', { skill: ['retired'] }]]);

      expect(findCoverageDefects({ skill: [] }, collections, [])).toEqual([
        'triage claims skill:retired, which the library does not hold.',
      ]);
    });
  });

  describe('closure', () => {
    it('reports a vetted member reaching an artifact of lesser standing', async () => {
      const fixtureDir = path.join(FIXTURES_DIR, 'leaky-closure');
      const collections = await readExplicitCollections(fixtureDir);
      const closure = await resolveClosure({ collection: ['recommended'] }, libraryResolver(fixtureDir));

      const defects = findClosureDefects(
        'recommended',
        listClosureIds(closure),
        ['recommended'],
        buildClaimMap(collections, []),
      );

      expect(defects).toEqual([
        "recommended's closure reaches skill:unvetted, whose disposition is triage; promote it or drop the edge.",
      ]);
    });

    it('reports a vetted member reaching a standalone artifact', () => {
      const claims = new Map([
        ['skill:vetted', new Set(['recommended'])],
        ['subagent:proof', new Set([STANDALONE_DISPOSITION])],
      ]);

      const defects = findClosureDefects('recommended', ['skill:vetted', 'subagent:proof'], ['recommended'], claims);

      expect(defects).toEqual([
        "recommended's closure reaches subagent:proof, whose disposition is standalone; promote it or drop the edge.",
      ]);
    });

    it('accepts a reached artifact holding a permitted disposition among others', () => {
      const claims = new Map([['skill:shared', new Set(['recommended', 'williamthorsen'])]]);

      expect(findClosureDefects('recommended', ['skill:shared'], ['recommended'], claims)).toEqual([]);
    });

    it('names every disposition a reported artifact holds', () => {
      const claims = new Map([['skill:shared', new Set(['recommended', 'williamthorsen'])]]);

      expect(findClosureDefects('teamx', ['skill:shared'], ['teamx'], claims)).toEqual([
        "teamx's closure reaches skill:shared, whose dispositions are recommended, williamthorsen; promote it or drop the edge.",
      ]);
    });

    it('reports a reached artifact carrying no claim at all', () => {
      expect(findClosureDefects('recommended', ['skill:unclaimed'], ['recommended'], new Map())).toEqual([
        "recommended's closure reaches skill:unclaimed, which carries no disposition; claim it or drop the edge.",
      ]);
    });
  });
});

// region | Helpers

/** Maps each artifact to every claim it carries: membership in each explicit collection, plus the standalone record. */
function buildClaimMap(
  byCollection: ReadonlyMap<string, ArtifactDependencies>,
  standalone: ReadonlyArray<ArtifactId>,
): ReadonlyMap<ArtifactId, ReadonlySet<string>> {
  const claims = new Map<ArtifactId, Set<string>>();
  const claim = (id: ArtifactId, claimant: string): void => {
    claims.set(id, (claims.get(id) ?? new Set<string>()).add(claimant));
  };
  for (const [collection, members] of byCollection) {
    for (const id of listArtifactIds(members)) {
      claim(id, collection);
    }
  }
  for (const id of standalone) {
    claim(id, STANDALONE_DISPOSITION);
  }
  return claims;
}

/**
 * Reports each artifact `collection`'s closure reaches that holds no permitted claim, naming the dispositions it does
 * hold. An artifact with no claim at all is reported too: the coverage check names it as well, but a closure that
 * leaks to an unclaimed artifact is the more urgent of the two readings.
 */
function findClosureDefects(
  collection: string,
  reached: ReadonlyArray<ArtifactId>,
  permitted: ReadonlyArray<string>,
  claimsOf: ReadonlyMap<ArtifactId, ReadonlySet<string>>,
): Array<string> {
  const allowed = new Set(permitted);
  const defects: Array<string> = [];
  for (const id of reached) {
    const claims = claimsOf.get(id) ?? new Set<string>();
    if ([...claims].some((claim) => allowed.has(claim))) {
      continue;
    }
    const held = [...claims].filter((claim) => DISPOSITIONS.has(claim)).toSorted();
    const clause =
      held.length === 0
        ? 'which carries no disposition; claim it or drop the edge'
        : `whose disposition${held.length === 1 ? ' is' : 's are'} ${held.join(', ')}; promote it or drop the edge`;
    defects.push(`${collection}'s closure reaches ${id}, ${clause}.`);
  }
  return defects.toSorted();
}

/**
 * Reports every departure from the coverage rules: a catalog artifact carrying no disposition, a membership
 * contradicting an absence a disposition asserts (standalone tolerates no other claim, triage no vetted claim), and a
 * claim naming an artifact the catalog no longer holds. The third is what a deletion leaves behind, and no closure
 * resolution reaches it, since only the vetted collections are resolved.
 */
function findCoverageDefects(
  catalog: ArtifactDependencies,
  byCollection: ReadonlyMap<string, ArtifactDependencies>,
  standalone: ReadonlyArray<ArtifactId>,
): Array<string> {
  const claimants = new Map<ArtifactId, Array<string>>();
  const claim = (id: ArtifactId, claimant: string): void => {
    claimants.set(id, [...(claimants.get(id) ?? []), claimant]);
  };
  for (const [collection, members] of byCollection) {
    for (const id of listArtifactIds(members)) {
      claim(id, collection);
    }
  }
  for (const id of standalone) {
    claim(id, STANDALONE_DISPOSITION);
  }

  const catalogIds = new Set(listArtifactIds(catalog));
  const defects: Array<string> = [];
  for (const id of catalogIds) {
    const claimed = claimants.get(id) ?? [];
    const vetted = claimed.filter((claimant) => VETTED_COLLECTIONS.includes(claimant));
    if (claimed.every((claimant) => !DISPOSITIONS.has(claimant))) {
      defects.push(`${id} carries no disposition; add it to a collection, or record it standalone with the reason.`);
    } else if (claimed.includes(STANDALONE_DISPOSITION) && claimed.length > 1) {
      const others = claimed.filter((claimant) => claimant !== STANDALONE_DISPOSITION);
      defects.push(
        `${id} is recorded standalone yet claimed by ${others.join(', ')}; standalone means membership in no collection.`,
      );
    } else if (claimed.includes(TRIAGE_DISPOSITION) && vetted.length > 0) {
      defects.push(`${id} is in both triage and ${vetted.join(', ')}; promotion moves an artifact out of triage.`);
    }
  }
  for (const [id, claimed] of claimants) {
    if (!catalogIds.has(id)) {
      defects.push(`${claimed.join(', ')} claims ${id}, which the library does not hold.`);
    }
  }
  return defects.toSorted();
}

/** Flattens a per-type slug map into artifact ids. */
function listArtifactIds(edges: ArtifactDependencies): Array<ArtifactId> {
  return ARTIFACT_TYPE_VALUES.flatMap((type) => (edges[type] ?? []).map((slug) => `${type}:${slug}`));
}

/** Flattens a resolved closure into artifact ids. */
function listClosureIds(closure: ResolvedClosure): Array<ArtifactId> {
  return [
    ...closure.rulebooks.map((slug) => `rulebook:${slug}`),
    ...closure.skills.map((slug) => `skill:${slug}`),
    ...closure.subagents.map((slug) => `subagent:${slug}`),
  ];
}

/**
 * Reads every collection in `contentDir` that enumerates its members, keyed by slug. One computing its members from
 * the whole catalog is excluded: it carries no disposition, and counting it would put every artifact in two
 * collections at once.
 */
async function readExplicitCollections(contentDir: string): Promise<ReadonlyMap<string, ArtifactDependencies>> {
  const collectionsDir = path.join(contentDir, ARTIFACT_TYPES.collection.contentPath);
  const found = new Map<string, ArtifactDependencies>();
  const files = (await listVisibleMarkdownFiles(collectionsDir)).toSorted();
  for (const file of files) {
    const slug = path.basename(file, '.md');
    const members = readMembers(await readFile(path.join(collectionsDir, file), 'utf8'), `collection ${slug}`);
    if (members.kind === 'explicit') {
      found.set(slug, members.edges);
    }
  }
  return found;
}

// endregion | Helpers
