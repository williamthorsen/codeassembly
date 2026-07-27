// Test-only construction of the recall seam `searchNotes` accepts. A test of scoping, filtering, or a command's
// projection states which notes recall found instead of matching them for real, so it needs neither ripgrep nor a
// query that happens to hit the right fixture notes.

import { sep } from 'node:path';

import type { RecallFn, RecallResult } from '../recall.ts';
import type { RawHit, ScopedKb } from '../types.ts';

/**
 * Builds a recall stub reporting `hits` as the notes found, attributing each to whichever in-scope KB contains it, and
 * reporting the KB roots in `missing` as absent. Every query recalls the same notes: what a test states here is the
 * recall outcome it wants, not a matcher to be re-derived.
 *
 * A hit path under no in-scope KB throws, since it can only mean the test named a note the scope never covered.
 */
export function buildRecallStub(input: { hits?: readonly string[]; missing?: readonly string[] } = {}): RecallFn {
  const hitPaths = input.hits ?? [];
  const missingPaths = new Set(input.missing ?? []);

  return function recallStub({ scopedKbs }): Promise<RecallResult> {
    const searched = scopedKbs.filter((kb) => !missingPaths.has(kb.path));
    return Promise.resolve({
      hits: hitPaths.map((path) => buildHit(path, searched)),
      missingKbs: scopedKbs.filter((kb) => missingPaths.has(kb.path)),
    });
  };
}

// region | Helpers

/** Attributes one note path to the in-scope KB that contains it, matching the shape real recall reports. */
function buildHit(path: string, searchedKbs: readonly ScopedKb[]): RawHit {
  const kb = searchedKbs.find((candidate) => path === candidate.path || path.startsWith(`${candidate.path}${sep}`));
  if (kb === undefined) {
    throw new Error(`recall stub was given the note "${path}", which lies under none of the in-scope KBs`);
  }
  return { path, kbName: kb.name, kbPath: kb.path, snippet: `snippet for ${path}` };
}

// endregion | Helpers
