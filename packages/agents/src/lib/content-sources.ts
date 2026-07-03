import { access } from 'node:fs/promises';
import path from 'node:path';

import { artifactFrontmatterPath, type ArtifactType } from './artifact-types.ts';

/** Where a `(type, slug)` artifact resolved from: the directory holding it and the source name (undefined = library). */
export interface ResolvedArtifactSource {
  readonly dir: string;
  readonly source: string | undefined;
}

/**
 * Resolves a `(type, slug)` artifact over an ordered search of declared sources (highest precedence first) then the
 * built-in library, by existence of its frontmatter file. `libraryDir` and `sources` are plain accessors callers reach
 * for directly — `libraryDir` for the library-only surfaces (e.g. `@library` collection expansion), `sources` for the
 * not-found error that enumerates every location searched.
 */
export interface SourceResolver {
  resolve(type: ArtifactType, slug: string): Promise<ResolvedArtifactSource | undefined>;
  readonly libraryDir: string;
  readonly sources: ReadonlyArray<{ name: string; dir: string }>;
}

/**
 * Builds a resolver that searches `sources` (in the given precedence order) then `libraryDir`, returning the first
 * whose `<dir>/artifactFrontmatterPath(type, slug)` exists. A source carries its `name`; the library carries
 * `source: undefined`.
 */
export function createSourceResolver(
  sources: ReadonlyArray<{ name: string; dir: string }>,
  libraryDir: string,
): SourceResolver {
  const candidates: ReadonlyArray<ResolvedArtifactSource> = [
    ...sources.map((source) => ({ dir: source.dir, source: source.name })),
    { dir: libraryDir, source: undefined },
  ];
  return {
    libraryDir,
    sources,
    async resolve(type, slug) {
      for (const candidate of candidates) {
        if (await fileExists(path.join(candidate.dir, artifactFrontmatterPath(type, slug)))) {
          return candidate;
        }
      }
      return;
    },
  };
}

/** A resolver over the built-in library alone — the behavior-identical legacy path for non-source callers. */
export function libraryResolver(libraryDir: string): SourceResolver {
  return createSourceResolver([], libraryDir);
}

// region | Helpers

/** Resolves whether a path points at an accessible file or directory. */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// endregion | Helpers
