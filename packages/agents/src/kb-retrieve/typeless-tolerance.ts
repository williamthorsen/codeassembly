// Transitional tolerance for notes that declare no usable recordType. The module is separate from the assertion
// projection so that it can be deleted whole once every note declares a recordType.

import type { SearchHit } from '../kb-search/types.ts';
import { normalizeHits } from './normalize.ts';
import type { AssertionCandidate } from './types.ts';

const NO_RECORD_TYPE_DIAGNOSTIC = 'note has no recordType; degraded to a low-signal candidate';

/**
 * Projects notes that declare no usable `recordType` into degraded candidates, so that recall still returns a broken
 * note.
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
