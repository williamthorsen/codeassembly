import { readFile } from 'node:fs/promises';

import { readNoteContent } from '@codeassembly/kb/note-io';
import { type KbAssertion, parseAssertion } from '@codeassembly/kb/records';

import { isEnoent } from '../lib/type-guards.ts';

/** Successful load: the note parsed into a typed assertion record, plus its original bytes for rollback. */
export interface LoadSuccess {
  ok: true;
  record: KbAssertion;
  /** The note's original on-disk content, retained so a supersede rollback can restore it. */
  content: string;
}

/** Categorical load failures the helper surfaces as structured results. */
export type LoadFailure =
  | { ok: false; reason: 'note-not-found'; path: string }
  | { ok: false; reason: 'note-parse'; path: string; parseError: string };

/** The outcome of attempting to load a note for editing. */
export type LoadOutcome = LoadSuccess | LoadFailure;

/**
 * Reads a note from disk and parses it as an assertion record, surfacing the two failure modes kb-edit cares about as
 * categorical results.
 *
 * `ENOENT` becomes `note-not-found`. A missing frontmatter block, a YAML parse error, or a field map that does not
 * satisfy the assertion contract each become `note-parse`, so an unmutatable or off-contract note is refused rather
 * than edited. Other I/O errors (permission denied, EIO) re-throw so callers surface them as system errors.
 */
export async function loadNote(input: { path: string }): Promise<LoadOutcome> {
  let content: string;
  try {
    content = await readFile(input.path, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return { ok: false, reason: 'note-not-found', path: input.path };
    }
    throw error;
  }

  const read = readNoteContent(content);
  if (read.error !== undefined) {
    return { ok: false, reason: 'note-parse', path: input.path, parseError: read.error };
  }

  const parsed = parseAssertion(read.fields, read.body);
  if (!parsed.ok) {
    return { ok: false, reason: 'note-parse', path: input.path, parseError: parsed.errors.join('; ') };
  }

  return { ok: true, record: parsed.record, content };
}
