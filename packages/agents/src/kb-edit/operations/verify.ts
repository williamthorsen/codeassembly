import type { KbAssertion } from '@williamthorsen/kb/records';

import { formatUtcTimestamp } from '../../kb-shared/note-helpers.ts';

/**
 * Sets `lastVerified` to `now` (UTC). Does **not** bump `updated`: re-verification is a curatorial event distinct from
 * a content edit, so it stays available regardless of a note's edit history.
 */
export function verify(record: KbAssertion, now: Date): KbAssertion {
  return { ...record, lastVerified: formatUtcTimestamp(now) };
}
