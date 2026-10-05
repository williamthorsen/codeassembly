/** Finds the open tickets related to a closed ticket, the candidates that a ripple reassesses. */
import { buildTokenPattern } from './cross-reference.ts';
import type { Issue } from './types.ts';

/** The relation tiers, in the order in which a candidate's first tier is chosen. */
export const RELATION_TIERS = ['mention', 'blocked', 'family', 'file-overlap'] as const;

export type RelationTier = (typeof RELATION_TIERS)[number];

/** An open ticket related to the closed one: listed under its first tier, with every tier that it matched. */
export interface RelatedCandidate {
  number: number;
  tier: RelationTier;
  tiers: RelationTier[];
  title: string;
}

/** Counts the candidates by their first tier. */
export function countByTier(candidates: readonly RelatedCandidate[]): Record<RelationTier, number> {
  const counts: Record<RelationTier, number> = { mention: 0, blocked: 0, family: 0, 'file-overlap': 0 };
  for (const candidate of candidates) counts[candidate.tier] += 1;
  return counts;
}

/**
 * Returns the open tickets related to `closed`, ordered by first tier and then by number. `closingPr` and `files` are
 * the closing pull request and the paths that it touched; without a closing PR, only the ticket number is mentioned and
 * the file-overlap tier is empty.
 */
export function findRelated(input: {
  closed: Issue;
  closingPr: number | null;
  files: readonly string[];
  open: readonly Issue[];
}): RelatedCandidate[] {
  const { closed, closingPr, open } = input;
  const files = closingPr === null ? [] : input.files;
  const mentionPatterns = [closed.number, ...(closingPr === null ? [] : [closingPr])].map(buildTokenPattern);

  const candidates: RelatedCandidate[] = [];
  for (const issue of open) {
    if (issue.number === closed.number) continue;
    const texts = [issue.title, issue.body, ...issue.comments.map((comment) => comment.body)];
    const matched: Record<RelationTier, boolean> = {
      mention: texts.some((text) => mentionPatterns.some((pattern) => pattern.test(text))),
      blocked: issue.blockedBy.includes(closed.number),
      family: closed.parent !== null && (issue.number === closed.parent || issue.parent === closed.parent),
      'file-overlap': files.length > 0 && texts.some((text) => mentionsFile(text, files)),
    };
    const tiers = RELATION_TIERS.filter((tier) => matched[tier]);
    const [tier] = tiers;
    if (tier !== undefined) candidates.push({ number: issue.number, tier, tiers, title: issue.title });
  }
  return candidates.toSorted(
    (a, b) => RELATION_TIERS.indexOf(a.tier) - RELATION_TIERS.indexOf(b.tier) || a.number - b.number,
  );
}

/**
 * Returns whether `token` names a file: It contains a `/`, or it ends in a dot and one to five alphanumerics. A bare
 * word such as `index` does not.
 */
export function isPathLike(token: string): boolean {
  return token.includes('/') || /\.[A-Za-z\d]{1,5}$/.test(token);
}

// region | Helpers

/**
 * Returns whether `text` contains a path-like token equal to one of `files` or to a trailing run of its segments, so
 * that `cli.ts` and `src/cli.ts` both match `packages/x/src/cli.ts`.
 */
function mentionsFile(text: string, files: readonly string[]): boolean {
  const tokens = text.match(/[\w./@-]+/g) ?? [];
  for (const raw of tokens) {
    const token = raw.replace(/^\.?\/+/, '').replace(/\.+$/, '');
    if (token === '' || !isPathLike(token)) continue;
    if (files.some((file) => file === token || file.endsWith(`/${token}`))) return true;
  }
  return false;
}

// endregion | Helpers
