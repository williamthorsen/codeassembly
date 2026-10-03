import { readFile } from 'node:fs/promises';

import { readNoteContent } from '@williamthorsen/kb/note-io';
import { type KbAssertion, parseAssertion } from '@williamthorsen/kb/records';

import { isEnoent } from '../lib/type-guards.ts';

/** Successful load: The note parsed into a typed assertion record. */
export interface LoadSuccess {
  ok: true;
  record: KbAssertion;
  /** The note's original on-disk content, retained so that a supersede rollback can restore it. */
  content: string;
}

/** Categorical load failures that the helper reports as structured results. */
export type LoadFailure =
  | { ok: false; reason: 'note-not-found'; path: string }
  | { ok: false; reason: 'note-parse'; path: string; parseError: string };

export type LoadOutcome = LoadSuccess | LoadFailure;

/**
 * Reads a note from disk and parses it as an assertion record. A missing file becomes `note-not-found`; frontmatter
 * that does not project as an assertion becomes `note-parse`. The function throws every other I/O error.
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
