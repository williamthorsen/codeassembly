import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import type { ParsedNote } from '@codeassembly/kb-core';
import { parseNoteContent } from '@codeassembly/kb-core/frontmatter';

/** A parsed note together with its vault-relative path, used for index keying and canonical wikilink targets. */
export interface EnumeratedNote {
  /** The parsed note, carrying its absolute path. */
  note: ParsedNote;
  /** The note's path relative to the KB root, slash-separated. */
  relativePath: string;
}

/** Directory names skipped during enumeration: any dot-prefixed dir (`.kb`, `.git`, `.agents`) and `node_modules`. */
function shouldSkipDir(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules';
}

/**
 * Walks a KB root recursively and parses every `*.md` note into an {@link EnumeratedNote}.
 *
 * Dot-prefixed directories and `node_modules` are skipped. Notes with malformed or absent frontmatter are kept —
 * `parseNoteContent` degrades them to `frontmatter: null` rather than throwing, so they remain valid wikilink
 * targets and surface their own `frontmatter.*` findings downstream. Each note's `path` is absolute so fixes can
 * operate on the file directly; `relativePath` is the slash-separated path from the KB root.
 */
export async function enumerateNotes(kbRoot: string): Promise<EnumeratedNote[]> {
  const notes: EnumeratedNote[] = [];
  await walk(kbRoot, kbRoot, notes);
  return notes;
}

// region | Helpers

async function walk(root: string, dir: string, out: EnumeratedNote[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      await walk(root, join(dir, entry.name), out);
      continue;
    }
    if (!entry.name.endsWith('.md')) continue;
    const absolutePath = join(dir, entry.name);
    const content = await readFile(absolutePath, 'utf8');
    const note = parseNoteContent({ content, path: absolutePath });
    out.push({ note, relativePath: relative(root, absolutePath).split(sep).join('/') });
  }
}

// endregion | Helpers
