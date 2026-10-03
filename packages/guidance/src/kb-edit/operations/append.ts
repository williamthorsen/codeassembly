import type { KbAssertion } from '@williamthorsen/kb/records';

import { formatUtcTimestamp } from '../../kb-shared/note-helpers.ts';

export interface AppendSuccess {
  ok: true;
  record: KbAssertion;
}

export interface AppendFailure {
  ok: false;
  reason: 'empty-addition';
  message: string;
}

export type AppendOutcome = AppendSuccess | AppendFailure;

/**
 * Appends `addition` to the end of the record's body with a single separating blank line, then bumps `updated`.
 *
 * Trimming the trailing whitespace from both the body and the addition keeps the separating blank line unambiguous and
 * ends the note with a single newline. An addition that is empty after trimming is rejected, because the write would
 * change nothing.
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
