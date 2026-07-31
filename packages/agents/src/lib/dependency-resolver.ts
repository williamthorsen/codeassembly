import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ARTIFACT_TYPE_VALUES, artifactFrontmatterPath, type ArtifactType } from './artifact-types.ts';
import { describeSearchedLocations, type SourceResolver } from './content-sources.ts';
import {
  type ArtifactDependencies,
  readDependencies,
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
 * path. A
 * collection is a traversal-only node: its members are followed but the collection itself is dropped from the
 * deployable result. A referenced artifact that resolves from no source or the library throws an error naming its
 * type and slug and every location searched.
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
    const edges = await readArtifactEdges(type, slug, resolver);
    for (const edgeType of ARTIFACT_TYPE_VALUES) {
      for (const edgeSlug of edges[edgeType] ?? []) {
        await visit(edgeType, edgeSlug, [...trail, id]);
      }
    }
    onPath.delete(id);
  }

  for (const type of ARTIFACT_TYPE_VALUES) {
    for (const slug of direct[type] ?? []) {
      await visit(type, slug, []);
    }
  }

  return {
    rulebooks: [...reached.rulebook],
    skills: [...reached.skill],
    subagents: [...reached.subagent],
  };
}

// region | Helpers

/**
 * Reads one artifact's outgoing edges, resolving its owning directory through `resolver`. Throws a clear error naming
 * every location searched when the artifact resolves from no source or the library. Every type resolves from any
 * source: a skill or subagent expands its include-expanded body against that source's own root, and a collection's
 * `'@library'` sentinel enumerates the content root it resolved from — the built-in library for a library collection,
 * the owning source for a source collection (a library collection's resolved directory is the library, so one rule
 * covers both). A collection's edges come from `members:` — that resolved-root catalog
 * when it carries `'@library'`, otherwise its explicit members. Every other type's edges come from
 * `dependencies:`. A skill or subagent additionally unions the invocation tokens in its include-expanded body
 * (`{skill:<slug>}` / `{subagent:<slug>}`, the same surface the render pass rewrites) — so a token inside a shared
 * partial becomes an edge for every artifact that includes it — and a subagent further unions its top-level `skills:`
 * injection list. A body token that names the artifact itself is dropped rather than unioned: a self-reference renders
 * per harness but is not a dependency and must not trip the cycle check; a self-dependency written in `dependencies:`
 * is not dropped, so it still errors. A rulebook unions its own body tokens the same way, reading them off the file as
 * read: its frontmatter file is also its body file, and it carries no includes to expand. A `{rulebook:<slug>}` token
 * is unioned only from a rulebook, because only a rulebook body renders one. Every unioned edge enters the closure
 * without a duplicate `dependencies:` declaration.
 */
async function readArtifactEdges(
  type: ArtifactType,
  slug: string,
  resolver: SourceResolver,
): Promise<ArtifactDependencies> {
  const resolved = await resolver.resolve(type, slug);
  if (resolved === undefined) {
    throw new Error(
      `Referenced ${type} "${slug}" was not found in any of: ${describeSearchedLocations(resolver, type, slug)}`,
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
    const tokens = extractInvocationEdges(content);
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
  // A body token that names its own artifact is a render-only self-reference, not a dependency: drop it before it
  // becomes an edge and reaches the cycle check. Only a same-kind, same-slug token self-collides, so filter per kind.
  // A self-dependency declared in frontmatter is left untouched and still surfaces as a cycle error.
  const bodySkills = type === 'skill' ? tokens.skills.filter((edge) => edge !== slug) : tokens.skills;
  const bodySubagents = type === 'subagent' ? tokens.subagents.filter((edge) => edge !== slug) : tokens.subagents;
  const injectedSkills = type === 'subagent' ? readInjectedSkills(content, label) : [];
  return {
    ...dependencies,
    skill: [...(dependencies.skill ?? []), ...bodySkills, ...injectedSkills],
    subagent: [...(dependencies.subagent ?? []), ...bodySubagents],
  };
}

// endregion | Helpers
