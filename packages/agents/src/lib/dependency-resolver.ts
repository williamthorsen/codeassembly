import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { ARTIFACT_TYPE_VALUES, artifactFrontmatterPath, type ArtifactType } from './artifact-types.ts';
import type { ContentDefect } from './content-defects.ts';
import { describeSearchedLocations, type SourceResolver } from './content-sources.ts';
import {
  type ArtifactDependencies,
  readDependencies,
  readInjectedRulebooks,
  readInjectedSkills,
  readMembers,
} from './dependency-frontmatter.ts';
import { expandIncludes } from './directive-expander.ts';
import { extractInvocationEdges } from './invocation-tokens.ts';
import { enumerateCatalogSlugs } from './library-catalog.ts';

/** The directly-declared slugs per type that seed closure resolution; an absent type seeds nothing. */
export type DirectArtifacts = Partial<Record<ArtifactType, ReadonlyArray<string>>>;

/** The deployable closure: every rulebook, skill, and subagent reached from the seeds. Collections are never emitted. */
export interface ResolvedClosure {
  readonly rulebooks: ReadonlyArray<string>;
  readonly skills: ReadonlyArray<string>;
  readonly subagents: ReadonlyArray<string>;
}

/**
 * Expands the directly-declared artifacts into their transitive closure, reading each visited artifact's edges — a
 * collection's `members:`, every other type's `dependencies:`, a subagent's top-level `skills:` injection list, plus
 * the invocation tokens in a rulebook's, skill's, or subagent's body — and following them across every type. The
 * result is deduped (a diamond dependency appears once) and acyclic — a cycle throws an error naming the offending
 * path. A collection is a traversal-only node: Its members are followed, but the collection itself is dropped from
 * the deployable result. A referenced artifact that resolves from no source or the library throws an error naming
 * its type and slug, the artifact that named it, and every location searched.
 */
export async function resolveClosure(direct: DirectArtifacts, resolver: SourceResolver): Promise<ResolvedClosure> {
  const reached: Record<ArtifactType, Set<string>> = {
    rulebook: new Set(),
    skill: new Set(),
    subagent: new Set(),
    collection: new Set(),
  };
  // The ancestors on the current DFS path; a node that reappears here closes a cycle.
  const onPath = new Set<string>();

  async function visit(type: ArtifactType, slug: string, trail: ReadonlyArray<string>): Promise<void> {
    const id = `${type}:${slug}`;
    if (onPath.has(id)) {
      throw new Error(`Dependency cycle detected: ${[...trail, id].join(' → ')}`);
    }
    if (reached[type].has(slug)) {
      return;
    }
    reached[type].add(slug);

    onPath.add(id);
    const edges = await readArtifactEdges(type, slug, resolver, trail);
    for (const edgeType of ARTIFACT_TYPE_VALUES) {
      const edgeSlugs = edges[edgeType] ?? [];
      for (const edgeSlug of edgeSlugs) {
        await visit(edgeType, edgeSlug, [...trail, id]);
      }
    }
    onPath.delete(id);
  }

  for (const type of ARTIFACT_TYPE_VALUES) {
    const slugs = direct[type] ?? [];
    for (const slug of slugs) {
      await visit(type, slug, []);
    }
  }

  return {
    rulebooks: [...reached.rulebook],
    skills: [...reached.skill],
    subagents: [...reached.subagent],
  };
}

/**
 * Walks the dependency closure one seed at a time and unions what each reaches. `resolveClosure` throws on the first
 * bad edge, so seeding it with the whole catalog would report one defect and abandon every artifact behind it; per-seed
 * makes each failure attributable to the artifact that owns the edge and lets the remaining seeds resolve.
 */
export async function resolveSeedClosures(
  seeds: DirectArtifacts,
  resolver: SourceResolver,
): Promise<{ closure: ResolvedClosure; defects: ReadonlyArray<ContentDefect> }> {
  const defects: Array<ContentDefect> = [];
  const reached = { rulebook: new Set<string>(), skill: new Set<string>(), subagent: new Set<string>() };

  for (const type of ARTIFACT_TYPE_VALUES) {
    const slugs = seeds[type] ?? [];
    for (const slug of slugs) {
      const seed: DirectArtifacts = { [type]: [slug] };
      try {
        const closure = await resolveClosure(seed, resolver);
        for (const reachedSlug of closure.rulebooks) {
          reached.rulebook.add(reachedSlug);
        }
        for (const reachedSlug of closure.skills) {
          reached.skill.add(reachedSlug);
        }
        for (const reachedSlug of closure.subagents) {
          reached.subagent.add(reachedSlug);
        }
      } catch (error: unknown) {
        defects.push({
          file: artifactFrontmatterPath(type, slug),
          kind: 'dependency',
          detail: describeError(error),
        });
      }
    }
  }

  return {
    closure: {
      rulebooks: Array.from(reached.rulebook).toSorted(),
      skills: Array.from(reached.skill).toSorted(),
      subagents: Array.from(reached.subagent).toSorted(),
    },
    defects,
  };
}

// region | Helpers

/**
 * Reads one artifact's outgoing edges, resolving its owning directory through `resolver`. Throws a clear error naming
 * every location searched when the artifact resolves from no source or the library, plus the artifact that named it
 * where `trail` carries one. A seed's trail is empty, and naming where a seed came from is its caller's job. Every type
 * resolves from any source: A skill or subagent expands its include-expanded body against that source's own root, and a
 * collection's `'@library'` sentinel enumerates the content root it resolved from — the built-in library for a library
 * collection, the owning source for a source collection (a library collection's resolved directory is the library, so
 * one rule covers both). A collection's edges come from `members:` — that resolved-root catalog when it carries
 * `'@library'`, otherwise its explicit members. Every other type's edges come from `dependencies:`. A skill or subagent
 * additionally unions the invocation tokens in its include-expanded body (`{skill:<slug>}` / `{subagent:<slug>}`, the
 * same surface the render pass rewrites) — so a token inside a shared partial becomes an edge for every artifact that
 * includes it — and a subagent further unions its top-level `skills:` and `rulebooks:` injection lists. A body token
 * that names the artifact itself is dropped rather than unioned: A self-reference renders per harness but is not a
 * dependency and must not trip the cycle check; a self-dependency written in `dependencies:` is not dropped, so it
 * still errors. A rulebook unions its own body tokens the same way, off its include-expanded body, since its
 * frontmatter file is also its body file. A `{rulebook:<slug>}` token is unioned from every body that renders one --
 * rulebook, skill, and subagent alike -- so a rulebook named only inline deploys. Every unioned edge enters the closure
 * without a duplicate `dependencies:` declaration.
 */
async function readArtifactEdges(
  type: ArtifactType,
  slug: string,
  resolver: SourceResolver,
  trail: ReadonlyArray<string>,
): Promise<ArtifactDependencies> {
  const resolved = await resolver.resolve(type, slug);
  if (resolved === undefined) {
    const referrer = trail.at(-1);
    const referrerClause = referrer === undefined ? '' : `, named by ${referrer},`;
    throw new Error(
      `Referenced ${type} "${slug}"${referrerClause} was not found in any of: ` +
        describeSearchedLocations(resolver, type, slug),
    );
  }
  const filePath = path.join(resolved.dir, artifactFrontmatterPath(type, slug));
  const content = await readFile(filePath, 'utf8');

  const label = `${type} ${slug}`;
  if (type === 'collection') {
    const members = readMembers(content, label);
    // `'@library'` enumerates the content root the collection resolved from, so a source collection expands its own
    // source rather than the built-in library. A library collection's `resolved.dir` is `libraryDir`, so this is exact.
    return members.kind === 'library' ? await enumerateCatalogSlugs(resolved.dir) : members.edges;
  }

  const dependencies = readDependencies(content, label);
  if (type === 'rulebook') {
    // Expanded to match the render surface, so a token inside an inlined partial becomes an edge for the rulebook that
    // inlines it.
    const tokens = extractInvocationEdges(await expandIncludes(filePath, resolved.dir));
    return {
      ...dependencies,
      rulebook: [...(dependencies.rulebook ?? []), ...tokens.rulebooks.filter((edge) => edge !== slug)],
      skill: [...(dependencies.skill ?? []), ...tokens.skills],
      subagent: [...(dependencies.subagent ?? []), ...tokens.subagents],
    };
  }

  // For a skill or subagent, the frontmatter file is also the body file. Expand its includes to match the render
  // surface, then union the body's invocation tokens — and, for a subagent, its `skills:` injection list — into the
  // declared dependencies. `visit` carries dedup and cycle-safety, so the unions are emitted unfiltered; a slug named
  // by both a token and `dependencies:` collapses to one visit.
  const expanded = await expandIncludes(filePath, resolved.dir);
  const tokens = extractInvocationEdges(expanded);
  // A body token that names its own artifact is a render-only self-reference, not a dependency: Drop it before it
  // becomes an edge and reaches the cycle check. Only a same-kind, same-slug token self-collides, so filter per kind.
  // A self-dependency declared in frontmatter is left untouched and still surfaces as a cycle error.
  const bodySkills = type === 'skill' ? tokens.skills.filter((edge) => edge !== slug) : tokens.skills;
  const bodySubagents = type === 'subagent' ? tokens.subagents.filter((edge) => edge !== slug) : tokens.subagents;
  const injectedRulebooks = type === 'subagent' ? readInjectedRulebooks(content, label) : [];
  const injectedSkills = type === 'subagent' ? readInjectedSkills(content, label) : [];
  return {
    ...dependencies,
    // Unfiltered: a rulebook and a skill of the same slug are distinct artifacts, so a same-slug token here is a
    // genuine cross-type edge rather than the self-reference the per-kind filters above drop.
    rulebook: [...(dependencies.rulebook ?? []), ...tokens.rulebooks, ...injectedRulebooks],
    skill: [...(dependencies.skill ?? []), ...bodySkills, ...injectedSkills],
    subagent: [...(dependencies.subagent ?? []), ...bodySubagents],
  };
}

// endregion | Helpers
