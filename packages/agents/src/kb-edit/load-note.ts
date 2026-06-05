import type { ParsedNote } from '@codeassembly/kb';
import { parseNote } from '@codeassembly/kb/frontmatter';

import { isEnoent } from '../lib/type-guards.ts';

/** Successful load: a fully-parsed note with valid frontmatter. */
export interface LoadSuccess {
  ok: true;
  note: ParsedNote;
}

/** Categorical load failures the helper surfaces as structured results. */
export type LoadFailure =
  | { ok: false; reason: 'note-not-found'; path: string }
  | { ok: false; reason: 'note-parse'; path: string; parseError: string };

/** The outcome of attempting to load a note for editing. */
export type LoadOutcome = LoadSuccess | LoadFailure;

/**
 * Reads a note from disk and parses its frontmatter, surfacing the two failure modes kb-edit cares about as
 * categorical results.
 *
 * `ENOENT` becomes `note-not-found`; a YAML parse error recorded by kb's parser becomes `note-parse`. Other
 * I/O errors (permission denied, EIO) re-throw so callers can surface them as system errors via the main process's
 * stderr/exit path. A note with no frontmatter block at all also resolves as `note-parse`, since kb-edit cannot
 * mutate frontmatter that isn't there.
 */
export async function loadNote(input: { path: string }): Promise<LoadOutcome> {
  let parsed: ParsedNote;
  try {
    parsed = await parseNote({ path: input.path });
  } catch (error) {
    if (isEnoent(error)) {
      return { ok: false, reason: 'note-not-found', path: input.path };
    }
    throw error;
  }

  const raw = parsed.frontmatterRaw;
  if (raw === null) {
    return { ok: false, reason: 'note-parse', path: input.path, parseError: 'no frontmatter block found' };
  }
  if (raw.parseError !== undefined) {
    return { ok: false, reason: 'note-parse', path: input.path, parseError: raw.parseError };
  }
  if (parsed.frontmatter === null) {
    // A frontmatter block was present and parsed without YAML errors, but the projection to typed Frontmatter
    // collapsed to null — for example, the block parsed as a scalar or sequence rather than a map. Treat as
    // unmutatable so callers don't operate on a missing frontmatter object.
    return { ok: false, reason: 'note-parse', path: input.path, parseError: 'frontmatter is not a YAML map' };
  }

  return { ok: true, note: parsed };
}
