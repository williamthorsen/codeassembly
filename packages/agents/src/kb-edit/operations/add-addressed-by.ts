import type { Frontmatter } from '@codeassembly/kb';

import { dedupeInOrder, formatUtcTimestamp, readStringList } from '../../kb-shared/note-helpers.ts';

/**
 * Appends references to a note's `addressed-by` list, creating the field when absent, preserving existing entries, and
 * de-duplicating in first-occurrence order, then bumps `updated:`. The value is always written as a sequence (the
 * shape #763 validates); entries stay free-form. An existing scalar `addressed-by` is read leniently and normalized to
 * a one-element list before the append, so a mis-authored note is repaired rather than rejected.
 */
export function addAddressedBy(input: {
  frontmatter: Frontmatter;
  body: string;
  references: readonly string[];
  now: Date;
}): { frontmatter: Frontmatter; body: string } {
  const existing = readStringList(input.frontmatter.extra, 'addressed-by');
  const merged = dedupeInOrder([...existing, ...input.references]);
  return {
    frontmatter: {
      ...input.frontmatter,
      updated: formatUtcTimestamp(input.now),
      extra: { ...input.frontmatter.extra, 'addressed-by': merged },
    },
    body: input.body,
  };
}
