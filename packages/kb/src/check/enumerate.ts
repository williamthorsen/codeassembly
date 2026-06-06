import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import process from 'node:process';

import picomatch from 'picomatch';

import type { KbConfig } from '../config/config-schema.ts';
import { parseNoteContent } from '../frontmatter/parse-note.ts';
import type { ParsedNote } from '../types.ts';

/** A parsed note together with its KB-root-relative path, used for index keying and canonical wikilink targets. */
export interface EnumeratedNote {
  /** The parsed note, carrying its absolute path. */
  note: ParsedNote;
  /** The note's path relative to the KB root, slash-separated. */
  relativePath: string;
}

/**
 * Walks a KB root and parses every note whose KB-root-relative path matches a `config.targets` glob and no
 * `config.exclude` glob into an {@link EnumeratedNote}.
 *
 * Matching uses `picomatch` with `dot:false`, so dot-prefixed directories (`.kb`, `.git`, `.agents`) are excluded
 * implicitly without naming them in `exclude`. The walk prunes the tree to each target's leading literal segment
 * (`content/**` descends only into `content/`); a target with no leading literal (e.g. `**\/*.md`) falls back to a
 * full walk. Excludes are honored during descent so an excluded subtree is never entered.
 *
 * Notes with malformed or absent frontmatter are kept — `parseNoteContent` degrades them to `frontmatter: null`
 * rather than throwing, so they remain valid wikilink targets and surface their own `frontmatter.*` findings. A note
 * that cannot be read, or a directory that cannot be listed, is skipped with a `kb:` stderr warning rather than
 * aborting the walk. Each note's `path` is absolute; `relativePath` is the slash-separated path from the KB root.
 */
export async function enumerateNotes(input: { kbRoot: string; config: KbConfig }): Promise<EnumeratedNote[]> {
  const { kbRoot, config } = input;
  const isTarget = picomatch([...config.targets], { dot: false });
  const isExcluded = picomatch([...config.exclude], { dot: false });
  const topLevelDirs = leadingLiteralSegments(config.targets);

  const notes: EnumeratedNote[] = [];
  await walk({ root: kbRoot, dir: kbRoot, isTarget, isExcluded, topLevelDirs, out: notes });
  return notes;
}

// region | Helpers

async function walk(input: {
  root: string;
  dir: string;
  isTarget: (test: string) => boolean;
  isExcluded: (test: string) => boolean;
  /** Top-level directory names to descend into, or `null` to walk the entire tree. */
  topLevelDirs: ReadonlySet<string> | null;
  out: EnumeratedNote[];
}): Promise<void> {
  const { root, dir, isTarget, isExcluded, topLevelDirs, out } = input;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb: warning: could not read directory ${dir}; skipping: ${message}\n`);
    return;
  }

  const atRoot = dir === root;
  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    const relativePath = relative(root, absolutePath).split(sep).join('/');

    if (entry.isDirectory()) {
      // Prune to the targets' leading literal segments at the top level; deeper levels always descend.
      if (atRoot && topLevelDirs !== null && !topLevelDirs.has(entry.name)) continue;
      if (isExcluded(relativePath)) continue;
      await walk({ root, dir: absolutePath, isTarget, isExcluded, topLevelDirs, out });
      continue;
    }

    if (!entry.name.endsWith('.md')) continue;
    if (!isTarget(relativePath) || isExcluded(relativePath)) continue;

    try {
      const content = await readFile(absolutePath, 'utf8');
      const note = parseNoteContent({ content, path: absolutePath });
      out.push({ note, relativePath });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`kb: warning: could not read note ${absolutePath}; skipping: ${message}\n`);
    }
  }
}

/**
 * Derives the top-level directory names to descend into from the targets' leading literal segments. A target whose
 * first segment is a literal (`content/**\/*.md` → `content`) contributes that name; a target with no leading literal
 * (a glob-first pattern like `**\/*.md` or `*.md`) forces a full walk, signalled by returning `null`.
 */
function leadingLiteralSegments(targets: readonly string[]): ReadonlySet<string> | null {
  const dirs = new Set<string>();
  for (const target of targets) {
    const firstSegment = target.split('/')[0] ?? '';
    if (firstSegment === '' || isGlobSegment(firstSegment)) {
      return null;
    }
    dirs.add(firstSegment);
  }
  return dirs;
}

/** Reports whether a path segment contains a glob metacharacter, making it non-literal. */
function isGlobSegment(segment: string): boolean {
  return /[*?[\]{}()!+@]/.test(segment);
}

// endregion | Helpers
