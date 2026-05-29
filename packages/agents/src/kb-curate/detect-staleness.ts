import type { Finding, ParsedNote } from '@codeassembly/kb-core';

import { computeAgeDays } from '../kb-shared/note-helpers.ts';

/**
 * Reports verification-staleness findings for one note, both at `warning` severity:
 *
 * - `verification.unmarked` — the note carries no `last-verified` field, or its value is absent or unparseable as a
 *   date. An unparseable stamp is treated the same as a missing one rather than being silently accepted as fresh.
 * - `verification.stale` — `last-verified` is older than `staleAfterDays` whole days before `now`.
 *
 * `now` is injected for testability, mirroring `kb-retrieve`'s normalizer. A note with no parseable frontmatter has
 * no `last-verified`, so it is treated as unmarked.
 */
export function detectStaleness(input: { note: ParsedNote; now: Date; staleAfterDays: number }): Finding[] {
  const { note, now, staleAfterDays } = input;
  const lastVerified = extractString(note.frontmatter?.extra, 'last-verified');
  const ageDays = lastVerified === null ? null : computeAgeDays(lastVerified, now);

  if (ageDays === null) {
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

// region | Helpers

/** Reads a string-valued field from a frontmatter `extra` map; `null` when absent or non-string. */
function extractString(extra: Record<string, unknown> | undefined, key: string): string | null {
  if (extra === undefined) {
    return null;
  }
  const value = extra[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

// endregion | Helpers
