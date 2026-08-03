import type { AliasMap } from '@williamthorsen/kb';
import type { KbAssertion } from '@williamthorsen/kb/records';
import { canonicalize } from '@williamthorsen/kb/tags';

import { dedupeInOrder } from '../../kb-shared/note-helpers.ts';

/**
 * Replaces the tag list, canonicalizing each entry through the supplied alias map and deduplicating in
 * first-occurrence order. An empty list is a valid result. Does **not** bump `updated`: retagging reorganizes how a
 * record is found, not what it asserts.
 *
 * Canonicalization can collapse distinct inputs onto the same canonical, so dedupe runs after canonicalize. The
 * pre-canonicalization list is returned as `originalTags` so the caller can surface an audit trail.
 */
export function retag(
  record: KbAssertion,
  tags: readonly string[],
  aliases: AliasMap,
): { record: KbAssertion; originalTags: string[]; canonicalTags: string[] } {
  const originalTags = [...tags];
  const canonicalTags = dedupeInOrder(originalTags.map((tag) => canonicalize(tag, aliases)));
  return { record: { ...record, tags: canonicalTags }, originalTags, canonicalTags };
}
