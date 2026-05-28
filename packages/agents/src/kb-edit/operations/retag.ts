import type { AliasMap, Frontmatter } from '@codeassembly/kb-core';
import { canonicalize } from '@codeassembly/kb-core/tags';

import { dedupeInOrder, formatUtcDate } from '../../kb-shared/note-helpers.ts';

/**
 * Replaces the tag list, canonicalizing each entry through the supplied alias map, deduplicating in
 * first-occurrence order, and bumping `updated:`. An empty list is a valid result.
 *
 * Canonicalization can collapse distinct inputs onto the same canonical, so dedupe runs after canonicalize.
 * The pre-canonicalization list is returned as `originalTags` so the caller can surface an audit trail.
 */
export function retag(input: {
  frontmatter: Frontmatter;
  body: string;
  tags: readonly string[];
  aliases: AliasMap;
  now: Date;
}): { frontmatter: Frontmatter; body: string; originalTags: string[]; canonicalTags: string[] } {
  const originalTags = [...input.tags];
  const canonicalTags = dedupeInOrder(originalTags.map((tag) => canonicalize(tag, input.aliases)));
  return {
    frontmatter: {
      ...input.frontmatter,
      tags: canonicalTags,
      updated: formatUtcDate(input.now),
      extra: { ...input.frontmatter.extra },
    },
    body: input.body,
    originalTags,
    canonicalTags,
  };
}
