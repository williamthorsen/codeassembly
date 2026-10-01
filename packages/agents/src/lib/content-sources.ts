import { access } from 'node:fs/promises';
import path from 'node:path';

import { artifactFrontmatterPath, type ArtifactType } from './artifact-types.ts';
import { isMissingFile } from './type-guards.ts';

/** Where a `(type, slug)` artifact resolved from: the directory containing it and the name of its source. */
export interface ResolvedArtifactSource {
  readonly dir: string;
  readonly source: string;
}

/**
 * Resolves a `(type, slug)` artifact over an ordered search of declared sources (highest precedence first), by
 * existence of its frontmatter file.
 */
export interface SourceResolver {
  readonly sources: ReadonlyArray<{ name: string; dir: string }>;
  resolve(type: ArtifactType, slug: string): Promise<ResolvedArtifactSource | undefined>;
}

/**
 * Builds a resolver that searches `sources` in the given precedence order, returning the first whose
 * `<dir>/artifactFrontmatterPath(type, slug)` exists.
 */
export function createSourceResolver(sources: ReadonlyArray<{ name: string; dir: string }>): SourceResolver {
  return {
    sources,
    async resolve(type, slug) {
      for (const source of sources) {
        if (await fileExists(path.join(source.dir, artifactFrontmatterPath(type, slug)))) {
          return { dir: source.dir, source: source.name };
        }
      }
      return;
    },
  };
}

/**
 * Renders the comma-joined list of every location that `resolver` searches for a `(type, slug)` artifact, in
 * precedence order, for a not-found error message. Shared so that the format cannot drift between callers.
 */
export function describeSearchedLocations(resolver: SourceResolver, type: ArtifactType, slug: string): string {
  return resolver.sources.map((source) => path.join(source.dir, artifactFrontmatterPath(type, slug))).join(', ');
}

/**
 * Names the sources below `winner` in `resolver`'s precedence order that also contain a `(type, slug)` artifact: the
 * sources that the resolved artifact shadows. Each is probed directly, so the result does not depend on which source
 * won the resolution.
 */
export async function findShadowedSources(
  resolver: SourceResolver,
  type: ArtifactType,
  slug: string,
  winner: string,
): Promise<ReadonlyArray<string>> {
  const winnerIndex = resolver.sources.findIndex((source) => source.name === winner);
  const shadowed: Array<string> = [];
  const lower = resolver.sources.slice(winnerIndex + 1);
  for (const source of lower) {
    if (await fileExists(path.join(source.dir, artifactFrontmatterPath(type, slug)))) {
      shadowed.push(source.name);
    }
  }
  return shadowed;
}

// region | Helpers

/**
 * Resolves whether a path points at a present file or directory. A missing-file error (`ENOENT`/`ENOTDIR`, a bare
 * absence) resolves to `false`; any other failure (e.g. `EACCES` on an unreadable source directory) rethrows, so a
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
