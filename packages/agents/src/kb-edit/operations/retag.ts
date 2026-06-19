import type { AliasMap, Frontmatter } from '@codeassembly/kb';
import { canonicalize } from '@codeassembly/kb/tags';

import { dedupeInOrder } from '../../kb-shared/note-helpers.ts';

/**
 * Replaces the tag list, canonicalizing each entry through the supplied alias map and deduplicating in
 * first-occurrence order. An empty list is a valid result. Does **not** bump `updated:` — retagging is a
 * curatorial edit that reorganizes how a record is found, not a substantive change to what it asserts.
 *
 * Canonicalization can collapse distinct inputs onto the same canonical, so dedupe runs after canonicalize.
 * The pre-canonicalization list is returned as `originalTags` so the caller can surface an audit trail.
 */
export function retag(input: { frontmatter: Frontmatter; body: string; tags: readonly string[]; aliases: AliasMap }): {
  frontmatter: Frontmatter;
  body: string;
  originalTags: string[];
  canonicalTags: string[];
} {
  const originalTags = [...input.tags];
  const canonicalTags = dedupeInOrder(originalTags.map((tag) => canonicalize(tag, input.aliases)));
  return {
    frontmatter: {
      ...input.frontmatter,
      tags: canonicalTags,
      extra: { ...input.frontmatter.extra },
    },
    body: input.body,
    originalTags,
    canonicalTags,
  };
}
