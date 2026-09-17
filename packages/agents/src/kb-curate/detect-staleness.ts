import type { Finding } from '@williamthorsen/kb';
import type { EnumeratedNote } from '@williamthorsen/kb/check';

import { computeAgeDays } from '../kb-shared/note-helpers.ts';

/**
 * Reports verification-staleness findings for one note, both at `warning` severity:
 *
 * - `verification.unmarked`: the note carries no parseable `last-verified` date. Emitted only when
 *   `vaultUsesVerification` is true.
 * - `verification.stale`: `last-verified` is older than `staleAfterDays` whole days before `now`. Emitted regardless
 *   of `vaultUsesVerification`.
 *
 * A note with no parseable frontmatter has no `last-verified`, so it counts as unmarked.
 */
export function detectStaleness(input: {
  note: EnumeratedNote;
  now: Date;
  staleAfterDays: number;
  vaultUsesVerification: boolean;
}): Finding[] {
  const { note, now, staleAfterDays, vaultUsesVerification } = input;
  const lastVerified = extractString(note.fields, 'last-verified');
  const ageDays = lastVerified === null ? null : computeAgeDays(lastVerified, now);

  if (ageDays === null) {
    if (!vaultUsesVerification) {
      return [];
    }
    return [
      {
        path: note.path,
        rule: 'verification.unmarked',
        severity: 'warning',
        message: 'no last-verified field; run kb-edit --verify after confirming the note still holds',
      },
    ];
  }

  if (ageDays > staleAfterDays) {
    return [
      {
        path: note.path,
        rule: 'verification.stale',
        severity: 'warning',
        message: `last-verified "${lastVerified}" is ${ageDays} days old (threshold ${staleAfterDays}); re-verify with kb-edit --verify`,
      },
    ];
  }

  return [];
}

/**
 * Reports whether a vault has adopted verification stamps: true when at least one note carries a parseable
 * `last-verified` value.
 */
export function vaultUsesVerification(notes: readonly EnumeratedNote[], now: Date): boolean {
  return notes.some((note) => {
    const lastVerified = extractString(note.fields, 'last-verified');
    return lastVerified !== null && computeAgeDays(lastVerified, now) !== null;
  });
}

// region | Helpers

/** Reads a trimmed string-valued field from a note's frontmatter; `null` when absent, non-string, or blank. */
function extractString(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

// endregion | Helpers
