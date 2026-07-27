import { sep } from 'node:path';

import type { RecallFn, RecallResult } from '../recall.ts';
import type { RawHit, ScopedKb } from '../types.ts';

/**
 * Builds a recall stub reporting `hits` as the notes found, attributing each to whichever in-scope KB contains it, and
 * reporting the KB roots in `missing` as absent. The query is ignored: every call recalls the same notes.
 *
 * A hit path under no in-scope KB throws, since it can only mean the test named a note the scope never covered.
 */
export function buildRecallStub(input: { hits?: readonly string[]; missing?: readonly string[] } = {}): RecallFn {
  const hitPaths = input.hits ?? [];
  const missingPaths = new Set(input.missing);

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
