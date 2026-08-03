import type { Finding } from '@williamthorsen/kb';
import type { EnumeratedNote } from '@williamthorsen/kb/check';

import { detectStaleness, vaultUsesVerification } from './detect-staleness.ts';
import { detectSupersede } from './detect-supersede.ts';

/**
 * Produces the curate-only findings over an already-enumerated note set: verification staleness (threshold
 * `staleAfterDays`) and supersede-graph defects. Whole-vault integrity (unresolved links, basename collisions) and the
 * `tag-alias`/`paths` lints are owned by `@williamthorsen/kb/check`; curate layers only its own detectors over the same
 * enumeration here.
 */
export function detectCurateFindings(input: {
  notes: readonly EnumeratedNote[];
  now: Date;
  staleAfterDays: number;
}): Finding[] {
  const { notes, now, staleAfterDays } = input;
  const usesVerification = vaultUsesVerification(notes, now);

  return [
    ...notes.flatMap((note) => detectStaleness({ note, now, staleAfterDays, vaultUsesVerification: usesVerification })),
    ...detectSupersede(notes),
  ];
}

/** Sorts findings by path, then line, then rule, for stable, readable output. */
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
