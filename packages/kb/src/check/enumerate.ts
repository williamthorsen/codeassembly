import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import process from 'node:process';

import type { KbConfig } from '../config/config-schema.ts';
import { createNoteScopeMatcher, type NoteScopeMatcher } from '../config/note-scope.ts';
import { readNoteContent } from '../note-io/read-note.ts';
import { isGlobSegment } from './glob-segments.ts';

/**
 * A note reduced to the fields the check pipeline and curate consume: its paths, its frontmatter field map, its body
 * and body-start line (for file-absolute link lines), its full content (for the paths lint), and any parse error.
 */
export interface EnumeratedNote {
  /** Absolute path the note was read from. */
  path: string;
  /** The note's path relative to the KB root, slash-separated. */
  relativePath: string;
  /** The frontmatter field map, empty when the block is absent or unparseable. */
  fields: Record<string, unknown>;
  /** The note body (everything after the frontmatter block). */
  body: string;
  /** The full original note content. */
  content: string;
  /** 1-based file line where the body begins. */
  bodyStartLine: number;
  /** Frontmatter parse or absence diagnostic, when the block was missing or could not be parsed. */
  error?: string;
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
 * Notes with malformed or absent frontmatter are kept — `readNoteContent` records the parse error in `error` and
 * returns an empty field map rather than throwing, so they remain valid wikilink targets. A note that cannot be read,
 * or a directory that cannot be listed, is skipped with a `kb:` stderr warning rather than aborting the walk. Each
 * note's `path` is absolute; `relativePath` is the slash-separated path from the KB root.
 */
export async function enumerateNotes(input: { kbRoot: string; config: KbConfig }): Promise<EnumeratedNote[]> {
  const { kbRoot, config } = input;
  const matcher = createNoteScopeMatcher(config);
  const topLevelDirs = leadingLiteralSegments(config.targets);

  const notes: EnumeratedNote[] = [];
  await walk({ root: kbRoot, dir: kbRoot, matcher, topLevelDirs, out: notes });
  return notes;
}

// region | Helpers

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

async function walk(input: {
  root: string;
  dir: string;
  matcher: NoteScopeMatcher;
  /** Top-level directory names to descend into, or `null` to walk the entire tree. */
  topLevelDirs: ReadonlySet<string> | null;
  out: EnumeratedNote[];
}): Promise<void> {
  const { root, dir, matcher, topLevelDirs, out } = input;

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
      if (matcher.isExcluded(relativePath)) continue;
      await walk({ root, dir: absolutePath, matcher, topLevelDirs, out });
      continue;
    }

    if (!entry.name.endsWith('.md')) continue;
    if (!matcher.isNote(relativePath)) continue;

    try {
      const content = await readFile(absolutePath, 'utf8');
      const { fields, body, bodyStartLine, error: parseError } = readNoteContent(content);
      out.push({
        path: absolutePath,
        relativePath,
        fields,
        body,
        content,
        bodyStartLine,
        ...(parseError !== undefined && { error: parseError }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`kb: warning: could not read note ${absolutePath}; skipping: ${message}\n`);
    }
  }
}

// endregion | Helpers
