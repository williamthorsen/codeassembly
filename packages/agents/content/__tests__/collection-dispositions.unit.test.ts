import path from 'node:path';

import { type ArtifactType, type Catalog, listCatalog, readArtifact, resolveClosure } from 'codeassembly/api';
import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';

// Declaring a collection is a claim about its members, so an artifact in none of them is deploying under a claim that
// nobody made. These two checks are what make the claim real rather than nominal: Coverage catches the artifact that
// was added without a disposition, and closure catches the unexamined artifact that a vetted collection reaches through
// an edge. Neither can be replaced by reading the collection files, because both defects are invisible there.

/** An artifact addressed as `<type>:<slug>`, the form used by the resolver's own errors. */
type ArtifactId = string;

/** Slugs per artifact type, the shape of a collection's `members:` and of a closure. */
type ArtifactDependencies = Partial<Catalog>;

/** Maps each plural `members:` key to the artifact type that it lists. */
const TYPE_BY_MEMBERS_KEY: Readonly<Record<string, ArtifactType>> = {
  collections: 'collection',
  rulebooks: 'rulebook',
  skills: 'skill',
  subagents: 'subagent',
};

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures', 'collection-dispositions');

/** The pseudo-collection recorded for a standalone artifact, so that a single map lists every claim on an artifact. */
const STANDALONE_DISPOSITION = 'standalone';

/** The collection for what nobody has examined; a member of it may not also be claimed by a vetted one. */
const TRIAGE_DISPOSITION = 'triage';

/**
 * The artifacts that do not belong to any collection, each with the reason it stands alone. Recorded here so that the
 * coverage check reads an absence as a decision; an artifact missing from both this record and every collection is
 * the oversight that the check exists to catch.
 */
const STANDALONE: Readonly<Record<ArtifactId, string>> = {
  'rulebook:codeassembly-content-specification':
    'wanted by repositories that author CodeAssembly content, which declare it directly',
  'rulebook:live-worktree-policy': 'wanted in the repositories carrying a `live` worktree, which declare it directly',
  'skill:migrate-feedback-memories': 'wanted once per machine, too rarely to justify a standing skill-index line',
  'subagent:canary': 'exercises the declared-subagent mechanism rather than doing work of its own',
};

/** Each vetted collection and the dispositions that its closure may reach. A collection absent here is not vetted. */
const VETTED_CLOSURES: ReadonlyArray<{ collection: string; reaches: ReadonlyArray<string> }> = [
  { collection: 'atlassian', reaches: ['atlassian', 'recommended'] },
  { collection: 'recommended', reaches: ['recommended'] },
  { collection: 'williamthorsen', reaches: ['recommended', 'williamthorsen'] },
];

/**
 * The opt-in collections: vetted, and additionally not reached by any collection outside themselves. A member is
 * deployed only where its own collection is declared, which is what an opt-in claim promises and what the check below
 * holds it to. The outbound half of that claim is `VETTED_CLOSURES` above, which every opt-in collection also appears in.
 */
const OPT_IN_COLLECTIONS: ReadonlyArray<string> = ['atlassian'];

/** The vetted collections' slugs, derived from the reach table. */
const VETTED_COLLECTIONS: ReadonlyArray<string> = VETTED_CLOSURES.map(({ collection }) => collection);

/**
 * Every claim that records a disposition. Membership in a collection outside this set is a plain-bundle claim: It
 * says nothing about the artifact, so it neither satisfies coverage nor conflicts with any disposition.
 */
const DISPOSITIONS: ReadonlySet<string> = new Set([...VETTED_COLLECTIONS, STANDALONE_DISPOSITION, TRIAGE_DISPOSITION]);

describe('collection dispositions', () => {
  const contentDir = CONTENT_ROOT;

  it('gives every library artifact a disposition', async () => {
    const [catalog, collections] = await Promise.all([
      listDeployableCatalog(contentDir),
      readExplicitCollections(contentDir),
    ]);

    expect(findCoverageDefects(catalog, collections, Object.keys(STANDALONE))).toEqual([]);
  });

  it.each(VETTED_CLOSURES)('keeps $collection closed over its own disposition', async ({ collection, reaches }) => {
    const collections = await readExplicitCollections(contentDir);
    const closure = await resolveClosure(contentDir, { collection: [collection] });

    const defects = findClosureDefects(
      collection,
      listClosureIds(closure),
      reaches,
      buildClaimMap(collections, Object.keys(STANDALONE)),
    );

    expect(defects).toEqual([]);
  });

  // Standalone spares an artifact the skill-index line that every collection member gets, and that is true only while
  // the collections' closures do not reach it. `triage` is the largest surface by far, so a new edge is likeliest
  // there, and the vetted-closure rules do not constrain it.
  it('keeps every standalone artifact out of the collections’ combined closure', async () => {
    const collections = await readExplicitCollections(contentDir);
    const closure = await resolveClosure(contentDir, { collection: collections.keys().toArray() });

    const defects = findClosureDefects(
      'every collection',
      listClosureIds(closure),
      collections.keys().toArray(),
      buildClaimMap(collections, Object.keys(STANDALONE)),
    );

    expect(defects).toEqual([]);
  });

  // An opt-in member costs a skill-index line on every machine that deploys it, and the collection's whole claim is
  // that only a machine declaring it deploys one. One restored invocation token undoes that silently: The general PR,
  // merge, review, and ticket skills each address a member through an optional token, and writing one in its required
  // form hands the members back to every consumer of those skills.
  it.each(OPT_IN_COLLECTIONS)('keeps %s out of every other collection’s closure', async (optIn) => {
    const collections = await readExplicitCollections(contentDir);
    const members = listArtifactIds(collections.get(optIn) ?? {});
    const defects: Array<string> = [];

    // A slug that does not name a collection leaves the member list empty, and the loop below does not report a leak
    // for an empty list. Failing here is what keeps a renamed or mistyped entry from retiring the check in silence.
    expect(
      members,
      `${optIn} does not name a collection with members, so the check below would pass vacuously.`,
    ).not.toEqual([]);

    for (const collection of collections.keys()) {
      if (collection === optIn) {
        continue;
      }
      const closure = await resolveClosure(contentDir, { collection: [collection] });
      defects.push(...findOptInLeaks(optIn, members, collection, listClosureIds(closure)));
    }

    const message =
      `A collection outside ${optIn} reaches one of its members, so declaring that collection deploys an artifact ` +
      `that only a machine opting into ${optIn} should have:\n  ${defects.join('\n  ')}`;
    expect(defects, message).toEqual([]);
  });

  it('records a standalone reason for every artifact that it exempts', () => {
    expect(Object.values(STANDALONE).filter((reason) => reason.length === 0)).toEqual([]);
  });

  describe('coverage', () => {
    it('reports an artifact not claimed by any collection', async () => {
      const fixtureDir = path.join(FIXTURES_DIR, 'uncovered');
      const [catalog, collections] = await Promise.all([
        listDeployableCatalog(fixtureDir),
        readExplicitCollections(fixtureDir),
      ]);

      expect(findCoverageDefects(catalog, collections, [])).toEqual([
        'skill:orphan does not have a disposition; add it to a collection, or record it standalone with the reason.',
      ]);
    });

    it('accepts an artifact claimed by two vetted collections', () => {
      const collections = new Map([
        ['recommended', { skill: ['shared'] }],
        ['williamthorsen', { skill: ['shared'] }],
      ]);

      expect(findCoverageDefects({ skill: ['shared'] }, collections, [])).toEqual([]);
    });

    it('accepts a triage artifact also claimed by a plain bundle', () => {
      const collections = new Map([
        ['bitbucket', { skill: ['unexamined'] }],
        ['triage', { skill: ['unexamined'] }],
      ]);

      expect(findCoverageDefects({ skill: ['unexamined'] }, collections, [])).toEqual([]);
    });

    it('reports an artifact claimed only by a plain bundle', () => {
      const collections = new Map([['bitbucket', { skill: ['unexamined'] }]]);

      expect(findCoverageDefects({ skill: ['unexamined'] }, collections, [])).toEqual([
        'skill:unexamined does not have a disposition; add it to a collection, or record it standalone with the reason.',
      ]);
    });

    it('reports a standalone record on an artifact claimed by a collection', () => {
      const collections = new Map([['triage', { skill: ['contested'] }]]);

      expect(findCoverageDefects({ skill: ['contested'] }, collections, ['skill:contested'])).toEqual([
        'skill:contested is recorded standalone yet claimed by triage; standalone excludes membership in any collection.',
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

    it('reports a claim on an artifact that the library no longer contains', () => {
      const collections = new Map([['triage', { skill: ['retired'] }]]);

      expect(findCoverageDefects({ skill: [] }, collections, [])).toEqual([
        'triage claims skill:retired, which the library does not contain.',
      ]);
    });
  });

  describe('closure', () => {
    it('reports a vetted member reaching an artifact of lesser standing', async () => {
      const fixtureDir = path.join(FIXTURES_DIR, 'leaky-closure');
      const collections = await readExplicitCollections(fixtureDir);
      const closure = await resolveClosure(fixtureDir, { collection: ['recommended'] });

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

    it('accepts a reached artifact with a permitted disposition among others', () => {
      const claims = new Map([['skill:shared', new Set(['recommended', 'williamthorsen'])]]);

      expect(findClosureDefects('recommended', ['skill:shared'], ['recommended'], claims)).toEqual([]);
    });

    it('names every disposition that a reported artifact has', () => {
      const claims = new Map([['skill:shared', new Set(['recommended', 'williamthorsen'])]]);

      expect(findClosureDefects('teamx', ['skill:shared'], ['teamx'], claims)).toEqual([
        "teamx's closure reaches skill:shared, whose dispositions are recommended, williamthorsen; promote it or drop the edge.",
      ]);
    });

    it('reports a reached artifact without any claim at all', () => {
      expect(findClosureDefects('recommended', ['skill:unclaimed'], ['recommended'], new Map())).toEqual([
        "recommended's closure reaches skill:unclaimed, which does not have a disposition; claim it or drop the edge.",
      ]);
    });
  });

  describe('opt-in reach', () => {
    it('reports a collection reaching an opt-in member', () => {
      expect(findOptInLeaks('atlassian', ['skill:vendor'], 'triage', ['skill:host', 'skill:vendor'])).toEqual([
        "triage's closure reaches skill:vendor, a member of the opt-in collection atlassian.",
      ]);
    });

    it('accepts a collection reaching none of them', () => {
      expect(findOptInLeaks('atlassian', ['skill:vendor'], 'triage', ['skill:host'])).toEqual([]);
    });

    it('reports every member reached by a collection', () => {
      const reached = ['skill:second', 'skill:first'];

      expect(findOptInLeaks('atlassian', ['skill:first', 'skill:second'], 'triage', reached)).toEqual([
        "triage's closure reaches skill:first, a member of the opt-in collection atlassian.",
        "triage's closure reaches skill:second, a member of the opt-in collection atlassian.",
      ]);
    });
  });
});

// region | Helpers

/** Maps each artifact to every claim on it: membership in each explicit collection, plus the standalone record. */
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
 * Reports each artifact reached by `collection`'s closure that does not have a permitted claim, naming the
 * dispositions that it does have. An artifact without any claim at all is reported too: The coverage check names it
 * as well, but a closure that reaches an unclaimed artifact is the more urgent of the two readings.
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
        ? 'which does not have a disposition; claim it or drop the edge'
        : `whose disposition${held.length === 1 ? ' is' : 's are'} ${held.join(', ')}; promote it or drop the edge`;
    defects.push(`${collection}'s closure reaches ${id}, ${clause}.`);
  }
  return defects.toSorted();
}

/**
 * Reports every departure from the coverage rules: a catalog artifact without a disposition, a membership
 * contradicting an absence asserted by a disposition (standalone excludes every other claim, triage every vetted
 * one), and a claim naming an artifact that the catalog no longer contains. The third is what a deletion leaves
 * behind, and closure resolution does not reach it, since only the vetted collections are resolved.
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
      defects.push(
        `${id} does not have a disposition; add it to a collection, or record it standalone with the reason.`,
      );
    } else if (claimed.includes(STANDALONE_DISPOSITION) && claimed.length > 1) {
      const others = claimed.filter((claimant) => claimant !== STANDALONE_DISPOSITION);
      defects.push(
        `${id} is recorded standalone yet claimed by ${others.join(', ')}; standalone excludes membership in any collection.`,
      );
    } else if (claimed.includes(TRIAGE_DISPOSITION) && vetted.length > 0) {
      defects.push(`${id} is in both triage and ${vetted.join(', ')}; promotion moves an artifact out of triage.`);
    }
  }
  for (const [id, claimed] of claimants) {
    if (!catalogIds.has(id)) {
      defects.push(`${claimed.join(', ')} claims ${id}, which the library does not contain.`);
    }
  }
  return defects.toSorted();
}

/**
 * Reports each member of `optIn` that `collection`'s closure reaches. `collection` is any collection but the opt-in
 * one itself, whose own closure is meant to reach its members.
 */
function findOptInLeaks(
  optIn: string,
  members: ReadonlyArray<ArtifactId>,
  collection: string,
  reached: ReadonlyArray<ArtifactId>,
): Array<string> {
  const claimed = new Set(members);
  return reached
    .filter((id) => claimed.has(id))
    .toSorted()
    .map((id) => `${collection}'s closure reaches ${id}, a member of the opt-in collection ${optIn}.`);
}

/** Flattens a per-type slug map into artifact ids. */
function listArtifactIds(edges: ArtifactDependencies): Array<ArtifactId> {
  return Object.entries(edges).flatMap(([type, slugs]) => slugs.map((slug) => `${type}:${slug}`));
}

/** Flattens a resolved closure into the ids of the artifacts that it deploys, leaving out the collections traversed. */
function listClosureIds({ rulebook, skill, subagent }: Catalog): Array<ArtifactId> {
  return listArtifactIds({ rulebook, skill, subagent });
}

/**
 * Lists a root's deployable artifacts, leaving its collections out: A collection is a claim about artifacts rather
 * than an artifact that needs a disposition.
 */
async function listDeployableCatalog(contentDir: string): Promise<ArtifactDependencies> {
  const { rulebook, skill, subagent } = await listCatalog(contentDir);
  return { rulebook, skill, subagent };
}

/** Parses a collection's `members:` mapping into slugs per type, throwing on a key or entry that does not fit. */
function parseMembers(members: Record<string, unknown>, slug: string): ArtifactDependencies {
  const edges: Partial<Record<ArtifactType, ReadonlyArray<string>>> = {};
  for (const [key, value] of Object.entries(members)) {
    const type = TYPE_BY_MEMBERS_KEY[key];
    if (type === undefined) {
      throw new Error(`Collection ${slug} lists an unknown member type "${key}"`);
    }
    if (value === null) {
      continue;
    }
    if (!Array.isArray(value)) {
      throw new TypeError(`Collection ${slug}: "${key}" must be a list of slugs`);
    }
    edges[type] = value.map((entry: unknown) => readEntrySlug(entry, slug));
  }
  return edges;
}

/** Reads one member entry, a bare slug or a `{ name }` object. */
function readEntrySlug(entry: unknown, collection: string): string {
  if (typeof entry === 'string') {
    return entry;
  }
  if (typeof entry === 'object' && entry !== null && 'name' in entry && typeof entry.name === 'string') {
    return entry.name;
  }
  throw new Error(`Collection ${collection} lists a member that is neither a slug nor a { name } entry`);
}

/**
 * Reads every collection in `contentDir` that enumerates its members, keyed by slug. One computing its members from
 * the whole catalog is excluded: It does not have a disposition, and counting it would put every artifact in two
 * collections at once.
 */
async function readExplicitCollections(contentDir: string): Promise<ReadonlyMap<string, ArtifactDependencies>> {
  const found = new Map<string, ArtifactDependencies>();
  const slugs = (await listCatalog(contentDir)).collection.toSorted();
  for (const slug of slugs) {
    const { members } = (await readArtifact(contentDir, 'collection', slug)).frontmatter;
    if (members === undefined || members === null) {
      found.set(slug, {});
    } else if (typeof members === 'object' && !Array.isArray(members)) {
      found.set(slug, parseMembers({ ...members }, slug));
    } else if (members !== '@library') {
      throw new Error(`Collection ${slug} declares members that are neither '@library' nor a mapping`);
    }
  }
  return found;
}

// endregion | Helpers
