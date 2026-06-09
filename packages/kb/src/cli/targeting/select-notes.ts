import type { Stats } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import picomatch from 'picomatch';

import type { EnumeratedNote } from '../../check/enumerate.ts';
import { leadingLiteralPrefix } from '../../check/glob-segments.ts';
import { isEnoent } from '../../type-guards.ts';

/** The outcome of resolving selection patterns against an enumerated vault. */
export interface SelectionResult {
  /** Notes matched by at least one pattern, in enumeration order, deduplicated. */
  selected: EnumeratedNote[];
  /** Patterns that matched no validatable note and are backed by no real on-disk path — likely typos. */
  unmatched: string[];
}

/**
 * Resolves selection patterns against an already-enumerated note set, returning the matched notes plus the patterns
 * that matched nothing real.
 *
 * Each pattern is matched as a `picomatch` glob against the notes' store-relative paths, so the store's
 * `targets`/`exclude` filtering is inherited and a quoted glob behaves the same as a shell-expanded one. A bare
 * directory expands to its subtree. A pattern matching no note is reported in `unmatched` unless a real on-disk path
 * backs it (a non-validatable file such as a README, an excluded subtree, or an empty directory), in which case it is
 * dropped silently — distinguishing a typo from a legitimately out-of-scope target.
 */
export async function selectNotes(input: {
  notes: readonly EnumeratedNote[];
  patterns: readonly string[];
  storeRoot: string;
}): Promise<SelectionResult> {
  const { notes, storeRoot } = input;
  const relativePaths = new Set(notes.map((entry) => entry.relativePath));
  const selectedPaths = new Set<string>();
  const unmatched: string[] = [];

  for (const rawPattern of input.patterns) {
    const pattern = normalizePattern(rawPattern);

    // An exact note-path match wins, so a literal path is matched verbatim — even one carrying glob
    // metacharacters (a `--vs` git path or a shell-expanded name like `content/Draft[v2].md`), which
    // as a pattern would over-match its character-class siblings.
    if (relativePaths.has(pattern)) {
      selectedPaths.add(pattern);
      continue;
    }

    const direct = matchPaths(notes, pattern);
    if (direct.length > 0) {
      for (const path of direct) selectedPaths.add(path);
      continue;
    }

    const resolved = await resolveEmptyPattern({ notes, pattern, storeRoot, selectedPaths });
    if (!resolved) unmatched.push(rawPattern);
  }

  const selected = notes.filter((entry) => selectedPaths.has(entry.relativePath));
  return { selected, unmatched };
}

// region | Helpers

/** Returns the store-relative paths of notes matching `pattern` as a `dot:false` glob. */
function matchPaths(notes: readonly EnumeratedNote[], pattern: string): string[] {
  const isMatch = picomatch(pattern, { dot: false });
  return notes.filter((entry) => isMatch(entry.relativePath)).map((entry) => entry.relativePath);
}

/**
 * Resolves a pattern that matched no note. A metachar-free pattern that is a directory on disk is retried as a subtree
 * (its matches are added to `selectedPaths`). Returns `true` when the pattern resolves to something real — subtree
 * matches, an empty directory, a non-note file, or a glob whose literal prefix exists — and `false` only when nothing
 * on disk backs it, marking it unmatched.
 */
async function resolveEmptyPattern(input: {
  notes: readonly EnumeratedNote[];
  pattern: string;
  storeRoot: string;
  selectedPaths: Set<string>;
}): Promise<boolean> {
  const { notes, pattern, storeRoot, selectedPaths } = input;

  if (leadingLiteralPrefix(pattern) === pattern) {
    const target = await tryStat(join(storeRoot, pattern));
    if (target?.isDirectory()) {
      for (const path of matchPaths(notes, `${pattern}/**`)) selectedPaths.add(path);
      return true; // A real directory resolves; an empty one simply contributes no matches.
    }
    return target !== null; // A real non-note file drops silently; a missing path is unmatched.
  }

  const prefix = leadingLiteralPrefix(pattern);
  return prefix !== '' && (await tryStat(join(storeRoot, prefix))) !== null;
}

/** Stats a path, returning its `Stats` or `null` when it does not exist. Non-ENOENT errors propagate. */
async function tryStat(path: string): Promise<Stats | null> {
  try {
    return await stat(path);
  } catch (error) {
    if (isEnoent(error)) return null;
    throw error;
  }
}

/** Strips a leading `./` and a single trailing `/` so directory and dot-relative inputs match cleanly. */
function normalizePattern(pattern: string): string {
  return pattern.replace(/^\.\//, '').replace(/\/$/, '');
}

// endregion | Helpers
