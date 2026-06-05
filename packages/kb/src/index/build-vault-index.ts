import { basename } from 'node:path';

import type { ParsedNote, VaultIndex } from '../types.ts';

/**
 * Builds a basename → set-of-paths index from a set of already-parsed notes, mapping each note's `.md` basename
 * (sans extension) to the note paths that share it. The `wikilinks` rule consumes this to resolve `[[Target]]`
 * references by basename, treating a multi-path entry as ambiguous.
 *
 * This works over the in-memory `notes` the runner already holds; it does **not** walk the filesystem. A note's
 * `path` is used verbatim as the index value, so callers control whether entries are vault-relative or absolute.
 */
export function buildVaultIndex(notes: readonly ParsedNote[]): VaultIndex {
  const index = new Map<string, Set<string>>();
  for (const note of notes) {
    const key = basename(note.path).replace(/\.md$/, '');
    let set = index.get(key);
    if (set === undefined) {
      set = new Set();
      index.set(key, set);
    }
    set.add(note.path);
  }
  return index;
}
