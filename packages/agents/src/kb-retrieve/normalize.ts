import { basename, dirname, isAbsolute, resolve } from 'node:path';

import type { ParsedNote } from '@codeassembly/kb/frontmatter';

import { computeAgeDays, extractString, parseNoteSafely, readStringList } from '../kb-shared/note-helpers.ts';
import type { RawHit, SearchHit } from '../kb-search/types.ts';
import type { Candidate, Supersession } from './types.ts';

/** Upper bound on `superseded-by` hops, guarding against a chain cycle. */
const MAX_SUPERSESSION_HOPS = 32;

// The recall policy under which a candidate carries recurrence signals (capture timestamp, repo, occurrence count)
// rather than a freshness age. It is the sole policy `toCandidate` tests against; every other value emits the freshness
// projection.
const RECURRENCE_RECENCY = 'recurrence-recency';

/**
 * Projects the shared search primitive's parsed hits onto the candidate table.
 *
 * Each hit arrives already parsed and carrying its record type's recall policy. For each, a `superseded-by` chain is
 * followed to the canonical successor with a cycle guard, and `last-verified` is converted to an age in whole days
 * against `now`. A hit whose frontmatter is missing or malformed still projects to a low-signal candidate carrying a
 * diagnostic rather than being dropped.
 *
 * Which ranking signals a candidate carries is driven by its recall policy: under `recurrence-recency` the candidate
 * carries `captured-at` and `repo` recurrence signals and surfaces its `summary` as the display `title`; under
 * `freshness` (and any other value) it carries a `last-verified` age and keeps its frontmatter `title`. The two signal
 * sets are mutually exclusive. After projection, each recurrence-recency candidate is stamped with the size of its
 * `repo` recurrence group.
 */
export async function normalizeHits(input: { hits: SearchHit[]; now: Date }): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  for (const { hit, note, recall } of input.hits) {
    candidates.push(await toCandidate({ hit, note, now: input.now, recall }));
  }
  stampOccurrences(candidates);
  return candidates;
}

// region | Helpers

/**
 * Stamps each recurrence-recency candidate with the size of its `repo` recurrence group: the count of query-matched
 * records sharing the same repository. Candidates outside that policy (no `capturedAt`) are left untouched. The group
 * key collapses a missing `repo` to an empty string so records lacking that signal still group together consistently.
 */
function stampOccurrences(candidates: Candidate[]): void {
  const groupSizes = new Map<string, number>();
  for (const candidate of candidates) {
    if (candidate.capturedAt === undefined) {
      continue;
    }
    const key = recurrenceKey(candidate);
    groupSizes.set(key, (groupSizes.get(key) ?? 0) + 1);
  }
  for (const candidate of candidates) {
    if (candidate.capturedAt === undefined) {
      continue;
    }
    candidate.occurrences = groupSizes.get(recurrenceKey(candidate)) ?? 1;
  }
}

/** The recurrence grouping key for a recurrence-recency candidate: its `repo`, defaulting to empty when absent. */
function recurrenceKey(candidate: Candidate): string {
  return candidate.repo ?? '';
}

/**
 * Follows a note's `superseded-by` chain to its canonical successor. Each hop's frontmatter is parsed and inspected
 * for a further `superseded-by`. A repeated path or an unreadable hop ends the walk; cycles are reported in the
 * `diagnostic` field rather than throwing.
 */
async function resolveSupersession(input: { path: string; note: ParsedNote }): Promise<Supersession> {
  const firstHop = extractString(input.note.frontmatter?.extra, 'superseded-by');
  if (firstHop === null) {
    return { superseded: false, canonicalPath: null };
  }

  const visited = new Set<string>([input.path]);
  let currentDir = dirname(input.path);
  let nextRef: string | null = firstHop;
  let canonicalPath: string | null = null;

  for (let hop = 0; hop < MAX_SUPERSESSION_HOPS; hop += 1) {
    if (nextRef === null) {
      break;
    }
    const resolvedPath = isAbsolute(nextRef) ? nextRef : resolve(currentDir, nextRef);
    if (visited.has(resolvedPath)) {
      return { superseded: true, canonicalPath, diagnostic: `superseded-by cycle at ${resolvedPath}` };
    }
    visited.add(resolvedPath);

    const successor = await parseNoteSafely(resolvedPath);
    if (successor.note === null) {
      return {
        superseded: true,
        canonicalPath,
        diagnostic: `superseded-by target not readable: ${resolvedPath}`,
      };
    }
    canonicalPath = resolvedPath;
    currentDir = dirname(resolvedPath);
    nextRef = extractString(successor.note.frontmatter?.extra, 'superseded-by');
  }

  if (nextRef !== null) {
    return { superseded: true, canonicalPath, diagnostic: 'superseded-by chain exceeded the hop limit' };
  }
  return { superseded: true, canonicalPath };
}

/**
 * Projects a parsed note and its hit metadata onto a normalized candidate, emitting the ranking signals its `recall`
 * policy calls for.
 *
 * Under `recurrence-recency` the candidate carries its `captured-at` and `repo` as recurrence signals and surfaces its
 * human-readable `summary` as the display `title` rather than the ULID basename; under `freshness` (and any fallback)
 * it carries a `last-verified` age and keeps its frontmatter `title`. The two signal sets are mutually exclusive, so
 * flipping a record type's policy in the schema flips which signals it emits.
 *
 * Independent of recall policy, an `addressed-by` list is read from any record type and surfaced flat when present.
 */
async function toCandidate(input: { hit: RawHit; note: ParsedNote; now: Date; recall: string }): Promise<Candidate> {
  const { hit, note, now, recall } = input;
  const frontmatter = note.frontmatter;
  const extra = frontmatter?.extra;

  const isRecurrence = recall === RECURRENCE_RECENCY;
  const capturedAt = isRecurrence ? extractString(extra, 'captured-at') : null;
  const summary = extractString(extra, 'summary');
  const repo = isRecurrence ? extractString(extra, 'repo') : null;

  const title = resolveTitle({ frontmatter, summary, capturedAt, path: hit.path });
  const diataxis = extractString(extra, 'diataxis');
  const tags = frontmatter?.tags ?? [];
  // Under recurrence-recency, ranking is by capture recency rather than freshness, so no `last-verified` age is
  // computed even when the record carries one; freshness (and the fallback) age the record.
  const lastVerifiedAgeDays = isRecurrence ? null : computeAgeDays(extractString(extra, 'last-verified'), now);
  const supersession = await resolveSupersession({ path: hit.path, note });
  const addressedBy = readStringList(extra, 'addressed-by');

  const candidate: Candidate = {
    path: hit.path,
    title,
    diataxis,
    tags,
    snippet: hit.snippet,
    lastVerifiedAgeDays,
    supersession,
    kbName: hit.kbName,
    ...(addressedBy.length > 0 && { addressedBy }),
    ...(capturedAt !== null && { capturedAt }),
    ...(capturedAt !== null && repo !== null && { repo }),
  };
  if (frontmatter === null) {
    candidate.diagnostic = 'frontmatter missing or malformed; degraded to a low-signal candidate';
  }
  return candidate;
}

/**
 * Resolves a candidate's display title: a recurrence-recency record (one carrying `captured-at`) surfaces as its
 * `summary`, falling back to the ULID basename when `summary` is absent; any other record keeps its frontmatter
 * `title`, falling back to the file basename.
 */
function resolveTitle(input: {
  frontmatter: ParsedNote['frontmatter'];
  summary: string | null;
  capturedAt: string | null;
  path: string;
}): string {
  if (input.capturedAt !== null) {
    return input.summary ?? basename(input.path);
  }
  return input.frontmatter !== null && input.frontmatter.title !== '' ? input.frontmatter.title : basename(input.path);
}

// endregion | Helpers
