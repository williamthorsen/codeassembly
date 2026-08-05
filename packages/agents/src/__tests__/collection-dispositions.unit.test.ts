import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ARTIFACT_TYPE_VALUES, ARTIFACT_TYPES } from '../lib/artifact-types.ts';
import { resolveContentDir } from '../lib/content-resolver.ts';
import { libraryResolver } from '../lib/content-sources.ts';
import { type ArtifactDependencies, readMembers } from '../lib/dependency-frontmatter.ts';
import { resolveClosure, type ResolvedClosure } from '../lib/dependency-resolver.ts';
import { listVisibleMarkdownFiles } from '../lib/fs-helpers.ts';
import { enumerateCatalogSlugs } from '../lib/library-catalog.ts';

// Declaring a collection is a claim about its members, so an artifact in none of them is deploying under a claim
// nobody made. These two checks are what make the claim real rather than nominal: coverage catches the artifact that
// slipped in with no disposition, and closure catches the unexamined artifact that a vetted collection reaches through
// an edge. Neither can be replaced by reading the collection files, because both defects are invisible there.

/** An artifact addressed as `<type>:<slug>`, the form the resolver's own errors use. */
type ArtifactId = string;

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures', 'collection-dispositions');

/** The pseudo-collection a standalone artifact carries, so one map answers "what disposition does this hold?". */
const STANDALONE_DISPOSITION = 'standalone';

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

describe('collection dispositions', () => {
  const contentDir = resolveContentDir();

  it('gives every library artifact exactly one disposition', async () => {
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
      buildDispositionMap(collections, Object.keys(STANDALONE)),
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
      buildDispositionMap(collections, Object.keys(STANDALONE)),
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

    it('reports an artifact two collections claim', () => {
      const collections = new Map([
        ['recommended', { skill: ['promoted'] }],
        ['triage', { skill: ['promoted'] }],
      ]);

      expect(findCoverageDefects({ skill: ['promoted'] }, collections, [])).toEqual([
        'skill:promoted carries the dispositions recommended, triage; an artifact takes exactly one.',
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
        buildDispositionMap(collections, []),
      );

      expect(defects).toEqual([
        "recommended's closure reaches skill:unvetted, whose disposition is triage; promote it or drop the edge.",
      ]);
    });

    it('reports a vetted member reaching a standalone artifact', () => {
      const dispositions = new Map([
        ['skill:vetted', 'recommended'],
        ['subagent:proof', STANDALONE_DISPOSITION],
      ]);

      const defects = findClosureDefects(
        'recommended',
        ['skill:vetted', 'subagent:proof'],
        ['recommended'],
        dispositions,
      );

      expect(defects).toEqual([
        "recommended's closure reaches subagent:proof, whose disposition is standalone; promote it or drop the edge.",
      ]);
    });
  });
});

// region | Helpers

/**
 * Maps each claimed artifact to the disposition it carries. A double-claimed artifact keeps its first claim; reporting
 * that conflict belongs to the coverage check, which runs over the same inputs.
 */
function buildDispositionMap(
  byCollection: ReadonlyMap<string, ArtifactDependencies>,
  standalone: ReadonlyArray<ArtifactId>,
): ReadonlyMap<ArtifactId, string> {
  const dispositions = new Map<ArtifactId, string>();
  for (const [collection, members] of byCollection) {
    for (const id of listArtifactIds(members)) {
      if (!dispositions.has(id)) {
        dispositions.set(id, collection);
      }
    }
  }
  for (const id of standalone) {
    if (!dispositions.has(id)) {
      dispositions.set(id, STANDALONE_DISPOSITION);
    }
  }
  return dispositions;
}

/**
 * Reports each artifact `collection`'s closure reaches whose disposition is not among `permitted`. An artifact with no
 * disposition at all is reported too: the coverage check names it as well, but a closure that leaks to an unclaimed
 * artifact is the more urgent of the two readings.
 */
function findClosureDefects(
  collection: string,
  reached: ReadonlyArray<ArtifactId>,
  permitted: ReadonlyArray<string>,
  dispositionOf: ReadonlyMap<ArtifactId, string>,
): Array<string> {
  const allowed = new Set(permitted);
  const defects: Array<string> = [];
  for (const id of reached) {
    const disposition = dispositionOf.get(id) ?? 'none';
    if (!allowed.has(disposition)) {
      defects.push(
        `${collection}'s closure reaches ${id}, whose disposition is ${disposition}; promote it or drop the edge.`,
      );
    }
  }
  return defects.toSorted();
}

/**
 * Reports every departure from the coverage identity: a catalog artifact no claimant covers, one that more than one
 * claimant covers, and a claim naming an artifact the catalog no longer holds. The third is what a deletion leaves
 * behind, and no closure resolution reaches it, since only the vetted collections are resolved.
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
    if (claimed.length === 0) {
      defects.push(`${id} carries no disposition; add it to a collection, or record it standalone with the reason.`);
    } else if (claimed.length > 1) {
      defects.push(`${id} carries the dispositions ${claimed.join(', ')}; an artifact takes exactly one.`);
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
  for (const file of (await listVisibleMarkdownFiles(collectionsDir)).toSorted()) {
    const slug = path.basename(file, '.md');
    const members = readMembers(await readFile(path.join(collectionsDir, file), 'utf8'), `collection ${slug}`);
    if (members.kind === 'explicit') {
      found.set(slug, members.edges);
    }
  }
  return found;
}

// endregion | Helpers
