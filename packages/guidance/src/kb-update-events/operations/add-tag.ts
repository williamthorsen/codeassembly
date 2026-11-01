import type { AliasMap } from '@williamthorsen/kb';
import type { KbEvent } from '@williamthorsen/kb/records';
import { canonicalize } from '@williamthorsen/kb/tags';

import { dedupeInOrder } from '../../kb-shared/note-helpers.ts';

/**
 * Appends tags to an event's tag list, canonicalizing each added tag through the alias map and keeping the existing
 * tags verbatim. Returns the input record itself when every added tag is already present, so that the caller can skip
 * the write.
 */
export function addTag(record: KbEvent, tags: readonly string[], aliases: AliasMap): KbEvent {
  const merged = dedupeInOrder([...record.tags, ...tags.map((tag) => canonicalize(tag, aliases))]);
  if (merged.length === record.tags.length) {
    return record;
  }
  return { ...record, tags: merged };
}
