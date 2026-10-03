import type { KbEvent } from '@williamthorsen/kb/records';

import { dedupeInOrder } from '../../kb-shared/note-helpers.ts';

/** Appends references to an event's `addressedBy` list, dropping duplicates. */
export function addAddressedBy(record: KbEvent, references: readonly string[]): KbEvent {
  return { ...record, addressedBy: dedupeInOrder([...record.addressedBy, ...references]) };
}
