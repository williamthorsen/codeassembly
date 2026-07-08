import { basename } from 'node:path';

/**
 * A vault-wide lookup from a note basename (without the `.md` extension) to the set of note paths that share it. A
 * single-path entry resolves a wikilink unambiguously; a multi-path entry is a basename collision. Consumed by the
 * vault-integrity checks and by curate's wikilink rewriter.
 */
export type VaultIndex = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * Builds a basename → set-of-paths index from a set of notes, mapping each note's `.md` basename (sans extension) to
 * the note paths that share it. Reads only each note's `path`, so it is type-blind — it needs no frontmatter or record
 * projection. A note's `path` is used verbatim as the index value, so callers control whether entries are
 * vault-relative or absolute.
 */
export function buildVaultIndex(notes: readonly { path: string }[]): VaultIndex {
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
