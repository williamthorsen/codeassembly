import { ARTIFACT_TYPE_VALUES, artifactFrontmatterPath, type ArtifactType } from '../artifact-types.ts';
import {
  type ArtifactId,
  type CollectionClaim,
  type DispositionClaims,
  listArtifactIds,
  listExplicitMembers,
  listPermittedReach,
  listUnclaimedArtifacts,
  readDispositionClaims,
} from '../collection-dispositions.ts';
import type { ContentDefect } from '../content-defects.ts';
import { resolveClosure } from '../dependency-resolver.ts';
import type { RuleContext } from './rule-context.ts';

/** The claim name recorded for an artifact that declares `standalone:`. */
const STANDALONE_CLAIM = 'standalone';

/**
 * Reports every departure from the root's declared dispositions: an artifact that none of them covers, a standalone
 * artifact that a collection contains or reaches, a dispositioned collection whose closure reaches beyond its
 * permitted reach, and a collection whose closure reaches an opt-in collection's members. Declaring a disposition is a
 * claim about what a consumer deploys, and each of these defects is visible only in a closure, never in a single file.
 *
 * A root that declares no disposition, no standalone artifact, and no `'@unclaimed'` collection is not checked. A
 * collection whose closure does not resolve is left to the resolution stage, which reports it.
 */
export async function findCollectionDispositionDefects({
  root,
  resolver,
}: RuleContext): Promise<ReadonlyArray<ContentDefect>> {
  const claims = await readDispositionClaims(root);
  const problems = claims.problems.filter((problem) => problem.cause === 'disposition');
  const hasUnclaimed = claims.collections.some(({ members }) => members.kind === 'unclaimed');
  const declaresAny =
    hasUnclaimed ||
    claims.standalone.size > 0 ||
    problems.length > 0 ||
    claims.collections.some(({ disposition }) => disposition !== undefined);
  if (!declaresAny) {
    return [];
  }

  const defects: Array<ContentDefect> = problems.map(({ file, detail }) => ({ file, kind: 'disposition', detail }));
  const claimsOf = buildClaimMap(claims);

  for (const [id, claimed] of claimsOf) {
    const enumerating = [...claimed].filter((claim) => claim !== STANDALONE_CLAIM && !isComputed(claims, claim));
    if (claimed.has(STANDALONE_CLAIM) && enumerating.length > 0) {
      defects.push({
        file: describeArtifactFile(id),
        kind: 'disposition',
        detail: `${id} declares standalone yet is claimed by ${enumerating.join(', ')}; standalone excludes membership in any collection.`,
      });
    }
  }
  if (!hasUnclaimed) {
    for (const id of listArtifactIds(claims.catalog)) {
      if ([...(claimsOf.get(id) ?? [])].every((claim) => !isDisposition(claims, claim))) {
        defects.push({
          file: describeArtifactFile(id),
          kind: 'disposition',
          detail: `${id} does not have a disposition; add it to a collection, or declare \`standalone:\` with the reason.`,
        });
      }
    }
  }

  const optInMembers = claims.collections
    .filter(({ disposition }) => disposition === 'opt-in')
    .map((collection) => ({ slug: collection.slug, members: new Set(listExplicitMembers(collection)) }));

  for (const collection of claims.collections) {
    if (collection.members.kind === 'library') {
      continue;
    }
    let reached: ReadonlyArray<ArtifactId>;
    try {
      const { rulebooks, skills, subagents } = await resolveClosure({ collection: [collection.slug] }, resolver);
      reached = listArtifactIds({ rulebook: rulebooks, skill: skills, subagent: subagents });
    } catch {
      continue;
    }
    defects.push(...findReachDefects(claims, collection, reached, claimsOf, optInMembers));
  }

  return defects.toSorted(
    (left, right) => left.file.localeCompare(right.file) || left.detail.localeCompare(right.detail),
  );
}

// region | Helpers

/**
 * Maps each artifact to every claim on it: the collections that enumerate it, the `'@unclaimed'` collections that
 * compute it, and the standalone record.
 */
function buildClaimMap(claims: DispositionClaims): ReadonlyMap<ArtifactId, ReadonlySet<string>> {
  const claimsOf = new Map<ArtifactId, Set<string>>();
  const unclaimed = listArtifactIds(listUnclaimedArtifacts(claims));
  const claimants: Array<[ReadonlyArray<ArtifactId>, string]> = [
    ...claims.collections.map((collection): [ReadonlyArray<ArtifactId>, string] => [
      collection.members.kind === 'unclaimed' ? unclaimed : listExplicitMembers(collection),
      collection.slug,
    ]),
    [claims.standalone.keys().toArray(), STANDALONE_CLAIM],
  ];
  for (const [ids, claimant] of claimants) {
    for (const id of ids) {
      claimsOf.set(id, (claimsOf.get(id) ?? new Set<string>()).add(claimant));
    }
  }
  return claimsOf;
}

/** Renders an artifact id as the root-relative path of the file that declares its frontmatter. */
function describeArtifactFile(id: ArtifactId): string {
  const separator = id.indexOf(':');
  return artifactFrontmatterPath(narrowArtifactType(id.slice(0, separator)), id.slice(separator + 1));
}

/**
 * Reports each artifact that `collection`'s closure reaches and should not: for a dispositioned collection, one
 * outside its permitted reach; for any collection, a standalone artifact or another collection's opt-in member.
 */
function findReachDefects(
  claims: DispositionClaims,
  collection: CollectionClaim,
  reached: ReadonlyArray<ArtifactId>,
  claimsOf: ReadonlyMap<ArtifactId, ReadonlySet<string>>,
  optInMembers: ReadonlyArray<{ readonly slug: string; readonly members: ReadonlySet<ArtifactId> }>,
): Array<ContentDefect> {
  const file = artifactFrontmatterPath('collection', collection.slug);
  const permitted = collection.disposition === undefined ? undefined : listPermittedReach(claims, collection);
  const defects: Array<ContentDefect> = [];
  for (const id of reached) {
    const held = [...(claimsOf.get(id) ?? [])].filter((claim) => isDisposition(claims, claim)).toSorted();
    if (held.includes(STANDALONE_CLAIM)) {
      // A direct member is already reported as a membership that standalone excludes.
      if (claimsOf.get(id)?.has(collection.slug) === true) {
        continue;
      }
      defects.push({
        file,
        kind: 'disposition',
        detail: `${collection.slug}'s closure reaches ${id}, which declares standalone; add it to a collection or drop the edge.`,
      });
      continue;
    }
    const optIn = optInMembers.find(({ slug, members }) => slug !== collection.slug && members.has(id));
    if (optIn !== undefined) {
      defects.push({
        file,
        kind: 'disposition',
        detail: `${collection.slug}'s closure reaches ${id}, a member of the opt-in collection ${optIn.slug}.`,
      });
      continue;
    }
    if (permitted !== undefined && !permitted.has(id)) {
      const clause =
        held.length === 0
          ? 'which does not have a disposition; claim it or drop the edge'
          : `whose disposition${held.length === 1 ? ' is' : 's are'} ${held.join(', ')}; promote it or drop the edge`;
      defects.push({ file, kind: 'disposition', detail: `${collection.slug}'s closure reaches ${id}, ${clause}.` });
    }
  }
  return defects;
}

/** Reports whether `claim` names a collection whose members are computed. */
function isComputed(claims: DispositionClaims, claim: string): boolean {
  return claims.collections.find(({ slug }) => slug === claim)?.members.kind !== 'explicit';
}

/** Reports whether `claim` records a disposition, rather than naming a plain bundle. */
function isDisposition(claims: DispositionClaims, claim: string): boolean {
  if (claim === STANDALONE_CLAIM) {
    return true;
  }
  const collection = claims.collections.find(({ slug }) => slug === claim);
  return collection?.disposition !== undefined || collection?.members.kind === 'unclaimed';
}

/** Narrows the type segment of an artifact id to its artifact type. */
function narrowArtifactType(segment: string): ArtifactType {
  const type = ARTIFACT_TYPE_VALUES.find((value) => value === segment);
  if (type !== undefined) {
    return type;
  }
  throw new Error(`Artifact id has an unknown type "${segment}".`);
}

// endregion | Helpers
