import type { KbAssertion } from '@codeassembly/kb/records';

import { formatUtcTimestamp } from '../../kb-shared/note-helpers.ts';

/**
 * Sets `updated` to `now` (UTC), leaving the body and every other field intact. The operation always produces a write,
 * so a note that had drifted out of the assertion contract surfaces at load time rather than rotting silently.
 */
export function bumpUpdated(record: KbAssertion, now: Date): KbAssertion {
  return { ...record, updated: formatUtcTimestamp(now) };
}
