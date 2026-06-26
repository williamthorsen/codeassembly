import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ARTIFACT_TYPE_VALUES, artifactFrontmatterPath, type ArtifactType } from './artifact-types.ts';
import { type ArtifactDependencies, readDependencies } from './dependency-frontmatter.ts';
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
 * Expands the directly-declared artifacts into their transitive dependency closure, reading each visited artifact's
 * `dependencies:` frontmatter and following its edges across every type. The result is deduped (a diamond dependency
 * appears once) and acyclic — a cycle throws an error naming the offending path. A collection is a traversal-only
 * node: its dependencies are followed but the collection itself is dropped from the deployable result. A referenced
 * artifact whose library file is absent throws an error naming its type and slug.
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
    const dependencies = await readArtifactDependencies(type, slug, contentDir);
    for (const dependencyType of ARTIFACT_TYPE_VALUES) {
      for (const dependencySlug of dependencies[dependencyType] ?? []) {
        await visit(dependencyType, dependencySlug, [...trail, id]);
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

/** Reads one artifact's declared dependencies, throwing a clear error when its library file is absent. */
async function readArtifactDependencies(
  type: ArtifactType,
  slug: string,
  contentDir: string,
): Promise<ArtifactDependencies> {
  const filePath = path.join(contentDir, artifactFrontmatterPath(type, slug));
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      throw new Error(`Declared ${type} "${slug}" was not found in the library at ${filePath}`);
    }
    throw error;
  }
  return readDependencies(content, `${type} ${slug}`);
}

// endregion | Helpers
