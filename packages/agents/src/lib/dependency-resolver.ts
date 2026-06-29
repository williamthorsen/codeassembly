import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ARTIFACT_TYPE_VALUES, artifactFrontmatterPath, type ArtifactType } from './artifact-types.ts';
import {
  type ArtifactDependencies,
  readDependencies,
  readInjectedSkills,
  readMembers,
} from './dependency-frontmatter.ts';
import { enumerateLibrarySlugs } from './library-catalog.ts';
import { isMissingFile } from './type-guards.ts';

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
 * collection's `members:`, every other type's `dependencies:`, plus a subagent's top-level `skills:` injection list —
 * and following them across every type. The result is
 * deduped (a diamond dependency appears once) and acyclic — a cycle throws an error naming the offending path. A
 * collection is a traversal-only node: its members are followed but the collection itself is dropped from the
 * deployable result. A referenced artifact whose library file is absent throws an error naming its type and slug.
 *
 * @param contentDir The library root each artifact's frontmatter file is resolved under.
 */
export async function resolveClosure(direct: DirectArtifacts, contentDir: string): Promise<ResolvedClosure> {
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
    const edges = await readArtifactEdges(type, slug, contentDir);
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
 * Reads one artifact's outgoing edges, throwing a clear error when its library file is absent. A collection's edges
 * come from `members:` — the full catalog when it carries `'@library'`, otherwise its explicit members. Every other
 * type's edges come from `dependencies:`; a subagent additionally unions its top-level `skills:` injection list into
 * those skill edges, so an injected skill enters the closure without a duplicate `dependencies:` declaration.
 */
async function readArtifactEdges(type: ArtifactType, slug: string, contentDir: string): Promise<ArtifactDependencies> {
  const filePath = path.join(contentDir, artifactFrontmatterPath(type, slug));
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      throw new Error(`Referenced ${type} "${slug}" was not found in the library at ${filePath}`);
    }
    throw error;
  }

  const label = `${type} ${slug}`;
  if (type === 'collection') {
    const members = readMembers(content, label);
    return members.kind === 'library' ? await enumerateLibrarySlugs(contentDir) : members.edges;
  }

  const dependencies = readDependencies(content, label);
  // A subagent's top-level `skills:` is its runtime injection list; union it into the skill edges so injected skills
  // enter the closure without a duplicate `dependencies:` declaration. `visit` carries dedup and cycle-safety, so the
  // union is emitted unfiltered — a skill named in both lists collapses to one visit.
  if (type === 'subagent') {
    const injected = readInjectedSkills(content, label);
    if (injected.length > 0) {
      return { ...dependencies, skill: [...(dependencies.skill ?? []), ...injected] };
    }
  }
  return dependencies;
}

// endregion | Helpers
