// Transitional tolerance for notes that carry no usable recordType. kb-retrieve owns assertions, but some stored notes
// still lack a recordType — a missing or malformed frontmatter block, or one without the field. Rather than hide a
// broken note from recall, this module surfaces it as a degraded, clearly-marked candidate. It is deliberately kept
// separate from the assertion projection so it can be deleted wholesale once every note carries a recordType, at which
// point kb-retrieve returns assertions only.

import type { SearchHit } from '../kb-search/types.ts';
import { normalizeHits } from './normalize.ts';
import type { AssertionCandidate } from './types.ts';

/** The diagnostic stamped on a typeless candidate whose frontmatter parsed but declared no recordType. */
const NO_RECORD_TYPE_DIAGNOSTIC = 'note has no recordType; degraded to a low-signal candidate';

/**
 * Projects notes that carry no usable `recordType` into degraded candidates, so a broken note is not silently dropped
 * from recall. Each candidate carries a diagnostic marking it second-class; a note whose frontmatter parsed (but lacks
 * a recordType) keeps whatever title and tags it does have, while a missing-frontmatter note degrades to its basename.
 */
export async function collectTypelessCandidates(input: {
  hits: SearchHit[];
  now: Date;
}): Promise<AssertionCandidate[]> {
  const candidates = await normalizeHits({ hits: input.hits, now: input.now });
  return candidates.map((candidate) => ({
    ...candidate,
    diagnostic: candidate.diagnostic ?? NO_RECORD_TYPE_DIAGNOSTIC,
  }));
}
