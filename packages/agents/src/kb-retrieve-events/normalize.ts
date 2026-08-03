import { basename } from 'node:path';

import { isEventImpact } from '@williamthorsen/kb/records';

import type { SearchHit } from '../kb-search/types.ts';
import { extractString, readStringList } from '../kb-shared/note-helpers.ts';
import type { EventCandidate } from './types.ts';

/**
 * Projects the shared search primitive's event hits onto the event candidate table. Each candidate carries its
 * recurrence signals — `captured-at`, `repo`, and an `occurrences` count — plus its `summary`, tags, any
 * `addressed-by` references, and its `impact` rating when set. After projection, each candidate is stamped with the
 * size of its `repo` recurrence group:
 * the count of query-matched events sharing the same repository. A note whose frontmatter is missing or malformed still
 * projects to a low-signal candidate carrying a diagnostic rather than being dropped.
 */
export function normalizeEvents(input: { hits: SearchHit[] }): EventCandidate[] {
  const candidates = input.hits.map((hit) => toEventCandidate(hit));
  stampOccurrences(candidates);
  return candidates;
}

// region | Helpers

/** Projects a single event hit onto a candidate, reading its recurrence signals and impact from frontmatter. */
function toEventCandidate(searchHit: SearchHit): EventCandidate {
  const { hit, note } = searchHit;
  const extra = note.frontmatter?.extra;

  const repo = extractString(extra, 'repo');
  const addressedBy = readStringList(extra, 'addressed-by');
  const rawImpact = extra?.impact;
  const impact = isEventImpact(rawImpact) ? rawImpact : undefined;

  const candidate: EventCandidate = {
    path: hit.path,
    summary: extractString(extra, 'summary') ?? basename(hit.path),
    capturedAt: extractString(extra, 'captured-at'),
    occurrences: 1,
    tags: note.frontmatter?.tags ?? [],
    snippet: hit.snippet,
    kbName: hit.kbName,
    ...(repo !== null && { repo }),
    ...(addressedBy.length > 0 && { addressedBy }),
    ...(impact !== undefined && { impact }),
  };
  if (note.frontmatter === null) {
    candidate.diagnostic = 'frontmatter missing or malformed; degraded to a low-signal candidate';
  }
  return candidate;
}

/**
 * Stamps each candidate with the size of its `repo` recurrence group. The group key collapses a missing `repo` to an
 * empty string so events lacking that signal still group together consistently.
 */
function stampOccurrences(candidates: EventCandidate[]): void {
  const groupSizes = new Map<string, number>();
  for (const candidate of candidates) {
    const key = candidate.repo ?? '';
    groupSizes.set(key, (groupSizes.get(key) ?? 0) + 1);
  }
  for (const candidate of candidates) {
    candidate.occurrences = groupSizes.get(candidate.repo ?? '') ?? 1;
  }
}

// endregion | Helpers
