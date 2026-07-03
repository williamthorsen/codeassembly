import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { isMissingFile } from '../lib/type-guards.ts';

/**
 * Best-effort decode of a Claude project-store slug back to the working directory it was derived from. Claude Code
 * builds the slug by collapsing every path separator — and other punctuation such as `.` — in the session cwd to `-`,
 * so the mapping is lossy and cannot be inverted by string substitution alone. It is instead resolved against the
 * filesystem: the slug's `-`-delimited segments are recombined and each candidate directory is probed, backtracking
 * until one full path resolves to an existing directory. Returns null when no `-`-only decoding maps to a live
 * directory — a dead store, or a real name whose `.` cannot be recovered — so a caller degrades to ungrounded rather
 * than acting on a guess.
 *
 * `isDirectory` is injected so the search can be unit-tested against a fixture set without touching the real filesystem.
 */
export async function resolveRepoPath(
  slug: string,
  isDirectory: (path: string) => Promise<boolean> = directoryExists,
): Promise<string | null> {
  // A leading `-` encodes the root `/`; drop the empty segment it produces so the search starts from `/`.
  const segments = slug.split('-');
  const start = segments[0] === '' ? 1 : 0;
  return searchSegments({ isDirectory, segments, prefix: '/', index: start });
}

// region | Helpers

/**
 * Depth-first search for a segmentation of `segments[index..]` that names an existing directory chain under `prefix`.
 * At each position it consumes the fewest segments first — a single directory name — lengthening only when the shorter
 * name fails to resolve the remainder, so single-segment intermediate directories match immediately and a multi-segment
 * name (a repo like `node-monorepo-tools`) is reassembled only where the filesystem requires it. Returns the full path
 * once every segment is consumed, else null.
 */
async function searchSegments(input: {
  isDirectory: (path: string) => Promise<boolean>;
  segments: readonly string[];
  prefix: string;
  index: number;
}): Promise<string | null> {
  const { isDirectory, segments, prefix, index } = input;
  if (index === segments.length) {
    return prefix;
  }
  for (let end = index + 1; end <= segments.length; end++) {
    const candidate = join(prefix, segments.slice(index, end).join('-'));
    if (await isDirectory(candidate)) {
      const resolved = await searchSegments({ isDirectory, segments, prefix: candidate, index: end });
      if (resolved !== null) {
        return resolved;
      }
    }
  }
  return null;
}

/** True when `path` resolves to a directory; false when it is absent or a path segment is not a directory. */
async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
}

// endregion | Helpers
