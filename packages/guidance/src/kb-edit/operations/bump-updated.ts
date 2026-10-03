import type { KbAssertion } from '@williamthorsen/kb/records';

import { formatUtcTimestamp } from '../../kb-shared/note-helpers.ts';

/** Sets `updated` to `now` (UTC). */
export function bumpUpdated(record: KbAssertion, now: Date): KbAssertion {
  return { ...record, updated: formatUtcTimestamp(now) };
}
