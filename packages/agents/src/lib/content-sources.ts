import { access } from 'node:fs/promises';
import path from 'node:path';

import { artifactFrontmatterPath, type ArtifactType } from './artifact-types.ts';
import { isMissingFile } from './type-guards.ts';

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
  readonly libraryDir: string;
  readonly sources: ReadonlyArray<{ name: string; dir: string }>;
  resolve(type: ArtifactType, slug: string): Promise<ResolvedArtifactSource | undefined>;
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

/**
 * Renders the comma-joined list of every location `resolver` searches for a `(type, slug)` artifact — each declared
 * source in precedence order, then the library — for a not-found error message. Shared so the format cannot drift
 * between callers.
 */
export function describeSearchedLocations(resolver: SourceResolver, type: ArtifactType, slug: string): string {
  return [...resolver.sources.map((source) => source.dir), resolver.libraryDir]
    .map((dir) => path.join(dir, artifactFrontmatterPath(type, slug)))
    .join(', ');
}

/**
 * Reports whether the built-in library carries a `(type, slug)` artifact. Used to detect a shadow: a source-resolved
 * artifact whose slug also exists in the library is masking the library one. Probes `resolver.libraryDir` directly,
 * so it answers regardless of which candidate won the resolution.
 */
export async function hasLibraryArtifact(resolver: SourceResolver, type: ArtifactType, slug: string): Promise<boolean> {
  return fileExists(path.join(resolver.libraryDir, artifactFrontmatterPath(type, slug)));
}

// region | Helpers

/**
 * Resolves whether a path points at a present file or directory. A missing-file error (`ENOENT`/`ENOTDIR`, a bare
 * absence) resolves to `false`; any other failure — e.g. `EACCES` on an unreadable source directory — rethrows, so a
 * higher-precedence source with a permission problem fails loud instead of being silently shadowed by a lower one.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
}

// endregion | Helpers
