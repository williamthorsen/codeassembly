import type { Frontmatter } from '@codeassembly/kb-core';

import { formatUtcDate } from '../../kb-shared/note-helpers.ts';

/**
 * Sets `updated:` to today (UTC). The body is preserved exactly. Running twice on the same UTC day is an
 * idempotent no-op at the field level but still produces a write — schema validation runs unconditionally
 * so a note that was already invalid surfaces as `schema-validation` rather than rotting silently.
 */
export function bumpUpdated(input: { frontmatter: Frontmatter; body: string; now: Date }): {
  frontmatter: Frontmatter;
  body: string;
} {
  return {
    frontmatter: { ...input.frontmatter, updated: formatUtcDate(input.now), extra: { ...input.frontmatter.extra } },
    body: input.body,
  };
}
