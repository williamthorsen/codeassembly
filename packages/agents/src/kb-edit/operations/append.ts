import type { Frontmatter } from '@codeassembly/kb';

import { formatUtcTimestamp } from '../../kb-shared/note-helpers.ts';

/** Successful append: a mutated `{ frontmatter, body }` ready for `writeBackNote`. */
export interface AppendSuccess {
  ok: true;
  frontmatter: Frontmatter;
  body: string;
}

/** Append rejected because the addition is empty after trimming whitespace. */
export interface AppendFailure {
  ok: false;
  reason: 'empty-addition';
  message: string;
}

/** The outcome of attempting to append. */
export type AppendOutcome = AppendSuccess | AppendFailure;

/**
 * Appends `addition` to the end of the existing body with a single separating blank line, then bumps `updated:`.
 *
 * The existing body and the addition both have trailing whitespace trimmed so the inserted blank line is unambiguous
 * and the final note ends with a single trailing newline. An addition that is empty or whitespace-only after
 * trimming is rejected so the caller surfaces `invalid-args` rather than committing a no-op write.
 */
export function append(input: { frontmatter: Frontmatter; body: string; addition: string; now: Date }): AppendOutcome {
  const trimmedAddition = input.addition.replace(/\s+$/, '');
  if (trimmedAddition === '') {
    return { ok: false, reason: 'empty-addition', message: '--append requires non-empty stdin' };
  }

  const trimmedBody = input.body.replace(/\s+$/, '');
  const newBody = `${trimmedBody}\n\n${trimmedAddition}\n`;

  return {
    ok: true,
    frontmatter: {
      ...input.frontmatter,
      updated: formatUtcTimestamp(input.now),
      extra: { ...input.frontmatter.extra },
    },
    body: newBody,
  };
}
