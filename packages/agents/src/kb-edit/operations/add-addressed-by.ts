import type { KbAssertion } from '@williamthorsen/kb/records';

import { dedupeInOrder, formatUtcTimestamp } from '../../kb-shared/note-helpers.ts';

/**
 * Appends references to a note's `addressedBy` list, de-duplicating in first-occurrence order, then bumps `updated`.
 */
export function addAddressedBy(record: KbAssertion, references: readonly string[], now: Date): KbAssertion {
  return {
    ...record,
    updated: formatUtcTimestamp(now),
    addressedBy: dedupeInOrder([...record.addressedBy, ...references]),
  };
}
