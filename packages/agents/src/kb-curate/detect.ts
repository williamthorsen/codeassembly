import type { Finding } from '@codeassembly/kb';
import type { EnumeratedNote } from '@codeassembly/kb/check';

import { detectStaleness, vaultUsesVerification } from './detect-staleness.ts';
import { detectSupersede } from './detect-supersede.ts';

/**
 * Produces the curate-only findings over an already-enumerated note set: verification staleness (threshold
 * `staleAfterDays`) and supersede-graph defects. The generic `frontmatter`/`tag-alias`/`wikilinks`/`paths` rules are
 * owned by `@codeassembly/kb/check`; curate layers only its own detectors here, so a single enumeration and a single
 * generic rule-running path remain in the monorepo.
 */
export function detectCurateFindings(input: {
  notes: readonly EnumeratedNote[];
  now: Date;
  staleAfterDays: number;
}): Finding[] {
  const { notes, now, staleAfterDays } = input;
  const parsedNotes = notes.map((entry) => entry.note);
  const usesVerification = vaultUsesVerification(parsedNotes, now);

  return [
    ...parsedNotes.flatMap((note) =>
      detectStaleness({ note, now, staleAfterDays, vaultUsesVerification: usesVerification }),
    ),
    ...detectSupersede(parsedNotes),
  ];
}

/** Sorts findings by path, then line, then rule, matching the ordering kb's parity golden uses. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return findings.toSorted((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    const lineA = a.line ?? 0;
    const lineB = b.line ?? 0;
    if (lineA !== lineB) return lineA - lineB;
    if (a.rule === b.rule) return 0;
    return a.rule < b.rule ? -1 : 1;
  });
}
