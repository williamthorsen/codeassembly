import type { AliasMap } from '@codeassembly/kb';
import type { KbEvent } from '@codeassembly/kb/records';
import { canonicalize } from '@codeassembly/kb/tags';

import { dedupeInOrder } from '../../kb-shared/note-helpers.ts';

/**
 * Replaces an event's tag list, canonicalizing each entry through the alias map and de-duplicating in
 * first-occurrence order. An empty list is a valid result (it clears the tags). No timestamp is stamped: retagging is a
 * curatorial annotation that stays available regardless of push state, distinct from the substantive content edits that
 * `capture-event --amend` makes before an event is pushed.
 */
export function retag(record: KbEvent, tags: readonly string[], aliases: AliasMap): KbEvent {
  return { ...record, tags: dedupeInOrder(tags.map((tag) => canonicalize(tag, aliases))) };
}
