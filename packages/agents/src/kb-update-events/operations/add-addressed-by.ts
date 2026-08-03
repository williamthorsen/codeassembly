import type { KbEvent } from '@williamthorsen/kb/records';

import { dedupeInOrder } from '../../kb-shared/note-helpers.ts';

/**
 * Appends references to an event's `addressedBy` list, preserving existing entries and de-duplicating in
 * first-occurrence order. No timestamp is stamped: `addressed-by` is a curatorial annotation that stays available
 * regardless of push state, not a substantive content edit (those go through `capture-event --amend`, and only until
 * the event is pushed).
 */
export function addAddressedBy(record: KbEvent, references: readonly string[]): KbEvent {
  return { ...record, addressedBy: dedupeInOrder([...record.addressedBy, ...references]) };
}
