import { stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Decodes a Claude project-store slug back to the working directory from which it was derived, as far as the filesystem
 * allows. Claude Code builds the slug by collapsing every path separator in the session cwd to `-`, and other
 * punctuation such as `.` with it, so the mapping is lossy and no string substitution inverts it; the decoding is
 * resolved against the filesystem instead. Returns null when no `-`-only decoding names a live directory, which covers
 * a dead store and a real name whose `.` cannot be recovered, and leaves the caller ungrounded.
 *
 * `isDirectory` is injected so that the search can be exercised against a fixture set without touching the real
 * filesystem.
 */
export async function resolveRepoPath(
  slug: string,
  isDirectory: (path: string) => Promise<boolean> = directoryExists,
): Promise<string | null> {
  // A leading `-` encodes the root `/`; drop the empty segment that it produces so the search starts from `/`.
  const segments = slug.split('-');
  const start = segments[0] === '' ? 1 : 0;
  return searchSegments({ isDirectory, segments, prefix: '/', index: start });
}

// region | Helpers

/**
 * Searches depth-first for a segmentation of `segments[index..]` that names an existing directory chain under `prefix`.
 * At each position it consumes the fewest segments first, lengthening only when the shorter name fails to resolve the
 * remainder, so a multi-segment directory name such as `node-monorepo-tools` is reassembled only where the filesystem
 * requires it. Returns the full path once every segment is consumed, else null.
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

/**
 * True when `path` resolves to a directory. Any `stat` failure yields `false`, so a probe error degrades slug
 * resolution to `null`: grounding is best-effort, and no filesystem error on a probe blocks it.
 */
async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

// endregion | Helpers
