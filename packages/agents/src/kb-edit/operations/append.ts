import type { KbAssertion } from '@williamthorsen/kb/records';

import { formatUtcTimestamp } from '../../kb-shared/note-helpers.ts';

/** Successful append: the mutated record, ready for `writeBackNote`. */
export interface AppendSuccess {
  ok: true;
  record: KbAssertion;
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
 * Appends `addition` to the end of the record's body with a single separating blank line, then bumps `updated`.
 *
 * The existing body and the addition both have trailing whitespace trimmed so the inserted blank line is unambiguous
 * and the final note ends with a single trailing newline. An addition that is empty or whitespace-only after trimming
 * is rejected so the caller surfaces `invalid-args` rather than committing a no-op write.
 */
export function append(record: KbAssertion, addition: string, now: Date): AppendOutcome {
  const trimmedAddition = addition.replace(/\s+$/, '');
  if (trimmedAddition === '') {
    return { ok: false, reason: 'empty-addition', message: '--append requires non-empty stdin' };
  }

  const trimmedBody = record.body.replace(/\s+$/, '');
  const newBody = `${trimmedBody}\n\n${trimmedAddition}\n`;

  return { ok: true, record: { ...record, updated: formatUtcTimestamp(now), body: newBody } };
}
