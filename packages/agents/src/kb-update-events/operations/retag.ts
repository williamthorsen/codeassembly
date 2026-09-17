import type { AliasMap } from '@williamthorsen/kb';
import type { KbEvent } from '@williamthorsen/kb/records';
import { canonicalize } from '@williamthorsen/kb/tags';

import { dedupeInOrder } from '../../kb-shared/note-helpers.ts';

/**
 * Replaces an event's tag list, canonicalizing each entry through the alias map and dropping duplicates. An empty list
 * clears the tags.
 */
export function retag(record: KbEvent, tags: readonly string[], aliases: AliasMap): KbEvent {
  return { ...record, tags: dedupeInOrder(tags.map((tag) => canonicalize(tag, aliases))) };
}
