import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { ARTIFACT_TYPE_VALUES, ARTIFACT_TYPES, artifactFrontmatterPath, type ArtifactType } from './artifact-types.ts';
import {
  type ArtifactDependencies,
  type Disposition,
  type MembersResult,
  readCollectionDisposition,
  readMembers,
  readStandaloneReason,
} from './dependency-frontmatter.ts';
import { listVisibleMarkdownFiles } from './fs-helpers.ts';
import { enumerateCatalogSlugs } from './library-catalog.ts';

/** An artifact addressed as `<type>:<slug>`, the form used by the resolver's own errors. */
export type ArtifactId = string;

/** One collection of a root, with the claim that its membership makes. */
export interface CollectionClaim {
  readonly slug: string;
  /** Absent for a plain bundle, whose membership does not claim anything. */
  readonly disposition: Disposition | undefined;
  /** The members as declared, with a computed token left unexpanded. */
  readonly members: MembersResult;
}

/** What one root's frontmatter claims about its artifacts. */
export interface DispositionClaims {
  /** Every deployable artifact of the root, collections excluded. */
  readonly catalog: ArtifactDependencies;
  readonly collections: ReadonlyArray<CollectionClaim>;
  /** Each artifact declaring `standalone:`, with its reason. */
  readonly standalone: ReadonlyMap<ArtifactId, string>;
  readonly problems: ReadonlyArray<ClaimProblem>;
}

/**
 * A file whose claim could not be read. `cause` separates a collection's unreadable `members:`, which resolution
 * reports on its own, from an unreadable `disposition:` or `standalone:`, which only the disposition rule reports.
 */
export interface ClaimProblem {
  readonly file: string;
  readonly cause: 'disposition' | 'members';
  readonly detail: string;
}

/** Flattens a per-type slug map into artifact ids. */
export function listArtifactIds(edges: ArtifactDependencies): Array<ArtifactId> {
  return Object.entries(edges).flatMap(([type, slugs]) => slugs.map((slug) => `${type}:${slug}`));
}

/**
 * Lists the artifacts that a dispositioned collection's closure may reach: its own members, every public collection's,
 * and, for a personal collection, every personal collection's. An opt-in collection never reaches another opt-in
 * collection's members, which would deploy them without that collection being declared.
 */
export function listPermittedReach(claims: DispositionClaims, collection: CollectionClaim): ReadonlySet<ArtifactId> {
  const permitted = new Set(listExplicitMembers(collection));
  for (const other of claims.collections) {
    if (other.disposition === 'public' || (collection.disposition === 'personal' && other.disposition === 'personal')) {
      for (const id of listExplicitMembers(other)) {
        permitted.add(id);
      }
    }
  }
  return permitted;
}

/** Lists the catalog artifacts that no dispositioned collection enumerates and that do not declare `standalone:`. */
export function listUnclaimedArtifacts(claims: DispositionClaims): ArtifactDependencies {
  const claimed = new Set<ArtifactId>(claims.standalone.keys());
  for (const collection of claims.collections) {
    if (collection.disposition !== undefined) {
      for (const id of listExplicitMembers(collection)) {
        claimed.add(id);
      }
    }
  }
  const unclaimed: { [Type in ArtifactType]?: ReadonlyArray<string> } = {};
  for (const type of ARTIFACT_TYPE_VALUES) {
    const slugs = claims.catalog[type];
    if (slugs !== undefined) {
      unclaimed[type] = slugs.filter((slug) => !claimed.has(`${type}:${slug}`));
    }
  }
  return unclaimed;
}

/**
 * Reads every collection's disposition and members and every artifact's standalone reason in `root`. A file whose
 * frontmatter cannot be read is recorded as a problem rather than thrown, so a caller can report every one.
 */
export async function readDispositionClaims(root: string): Promise<DispositionClaims> {
  const problems: Array<ClaimProblem> = [];

  const collections: Array<CollectionClaim> = [];
  const collectionFiles = await listVisibleMarkdownFiles(path.join(root, ARTIFACT_TYPES.collection.contentPath));
  for (const file of collectionFiles.toSorted()) {
    const slug = path.basename(file, '.md');
    const relative = artifactFrontmatterPath('collection', slug);
    const content = await readFile(path.join(root, relative), 'utf8');
    let members: MembersResult;
    try {
      members = readMembers(content, relative);
    } catch (error: unknown) {
      problems.push({ file: relative, cause: 'members', detail: describeError(error) });
      continue;
    }
    try {
      collections.push({ slug, disposition: readCollectionDisposition(content, relative), members });
    } catch (error: unknown) {
      problems.push({ file: relative, cause: 'disposition', detail: describeError(error) });
    }
  }

  const catalog = await enumerateCatalogSlugs(root);
  const standalone = new Map<ArtifactId, string>();
  for (const type of ARTIFACT_TYPE_VALUES) {
    const slugs = catalog[type] ?? [];
    for (const slug of slugs) {
      const relative = artifactFrontmatterPath(type, slug);
      try {
        const reason = readStandaloneReason(await readFile(path.join(root, relative), 'utf8'), relative);
        if (reason !== undefined) {
          standalone.set(`${type}:${slug}`, reason);
        }
      } catch (error: unknown) {
        problems.push({ file: relative, cause: 'disposition', detail: describeError(error) });
      }
    }
  }

  return { catalog, collections, standalone, problems };
}

// region | Helpers

/** Lists a collection's enumerated members, empty for a computed one. */
function listExplicitMembers({ members }: CollectionClaim): Array<ArtifactId> {
  return members.kind === 'explicit' ? listArtifactIds(members.edges) : [];
}

// endregion | Helpers
