import type { Frontmatter } from '@codeassembly/kb';

import { formatUtcTimestamp } from '../../kb-shared/note-helpers.ts';

/**
 * Sets `updated:` to the current instant (UTC). The body is preserved exactly. The operation always
 * produces a write — schema validation runs unconditionally, so a note that was already invalid surfaces
 * as `schema-validation` rather than rotting silently.
 */
export function bumpUpdated(input: { frontmatter: Frontmatter; body: string; now: Date }): {
  frontmatter: Frontmatter;
  body: string;
} {
  return {
    frontmatter: {
      ...input.frontmatter,
      updated: formatUtcTimestamp(input.now),
      extra: { ...input.frontmatter.extra },
    },
    body: input.body,
  };
}
