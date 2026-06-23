import type { KbEvent } from '@codeassembly/kb/records';

import { dedupeInOrder } from '../../kb-shared/note-helpers.ts';

/**
 * Appends references to an event's `addressedBy` list, preserving existing entries and de-duplicating in
 * first-occurrence order. Events are write-once, so nothing else changes and no timestamp is stamped — `addressed-by`
 * is an append-only annotation, not a substantive edit.
 */
export function addAddressedBy(record: KbEvent, references: readonly string[]): KbEvent {
  return { ...record, addressedBy: dedupeInOrder([...record.addressedBy, ...references]) };
}
