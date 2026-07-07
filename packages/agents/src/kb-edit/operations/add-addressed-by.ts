import type { KbAssertion } from '@codeassembly/kb/records';

import { dedupeInOrder, formatUtcTimestamp } from '../../kb-shared/note-helpers.ts';

/**
 * Appends references to a note's `addressedBy` list, preserving existing entries and de-duplicating in first-occurrence
 * order, then bumps `updated`. The list is always a sequence on a parsed record, so no scalar coercion is needed here.
 */
export function addAddressedBy(record: KbAssertion, references: readonly string[], now: Date): KbAssertion {
  return {
    ...record,
    updated: formatUtcTimestamp(now),
    addressedBy: dedupeInOrder([...record.addressedBy, ...references]),
  };
}
