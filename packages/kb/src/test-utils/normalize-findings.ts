import type { Finding } from '../types.ts';

/**
 * Sorts findings by path, then line, then rule, then message, into a canonical order for order-independent
 * comparison. Message breaks the tie because a vault-scoped rule reports every one of its findings against the same
 * file with no line, so path, line, and rule alone leave them indistinguishable.
 */
export function normalizeFindings(findings: readonly Finding[]): Finding[] {
  return findings.toSorted((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    const lineA = a.line ?? 0;
    const lineB = b.line ?? 0;
    if (lineA !== lineB) return lineA - lineB;
    if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1;
    if (a.message === b.message) return 0;
    return a.message < b.message ? -1 : 1;
  });
}
