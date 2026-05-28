import type { Frontmatter } from '@codeassembly/kb-core';

import { formatUtcDate } from '../../kb-shared/note-helpers.ts';

/**
 * Sets `last-verified:` to today (UTC), inserting the field if it isn't already present. Does **not** bump
 * `updated:` — the schema treats `last-verified:` as a re-verification event distinct from a content edit.
 *
 * The `extra` map preserves key order on round-trip, so the first `--verify` adds `last-verified` at the
 * end of the YAML map and subsequent runs update the value in place.
 */
export function verify(input: { frontmatter: Frontmatter; body: string; now: Date }): {
  frontmatter: Frontmatter;
  body: string;
} {
  return {
    frontmatter: {
      ...input.frontmatter,
      extra: { ...input.frontmatter.extra, 'last-verified': formatUtcDate(input.now) },
    },
    body: input.body,
  };
}
