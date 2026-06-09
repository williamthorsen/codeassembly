import { basename, dirname, isAbsolute, resolve } from 'node:path';

import type { ParsedNote } from '@codeassembly/kb/frontmatter';
import { parseNote } from '@codeassembly/kb/frontmatter';
import type { Schema } from '@codeassembly/kb/schema';
import { defaultSchema } from '@codeassembly/kb/schema';

import { computeAgeDays } from '../kb-shared/note-helpers.ts';
import type { Candidate, RawHit, RecallFilters, Supersession } from './types.ts';

/** Upper bound on `superseded-by` hops, guarding against a chain cycle. */
const MAX_SUPERSESSION_HOPS = 32;

// The recall-policy vocabulary kb-retrieve recognizes, mirroring the values declared in the kb package's default
// schema. `recurrence-recency` is the only policy that diverges from the freshness default, so it is the sole literal
// the dispatch tests against; every other value (including an unrecognized one) falls through to freshness.
const FRESHNESS = 'freshness';
const RECURRENCE_RECENCY = 'recurrence-recency';

/**
 * Normalizes raw ripgrep hits into the candidate table.
 *
 * Each hit's frontmatter is parsed; the `--diataxis`, `--tag`, and `--folder` filters are applied as post-filters on the
 * parsed frontmatter and the note path; a `superseded-by` chain is followed to the canonical successor with a cycle
 * guard; and `last-verified` is converted to an age in whole days against `now`. Notes with missing or malformed
 * frontmatter degrade to a low-signal candidate carrying a diagnostic rather than being dropped.
 *
 * A hit whose file cannot be read at normalization time (deleted, permission change, dead symlink) is skipped from the
 * candidate table; its path and the underlying error are appended to `warnings` so the dropped hit is surfaced rather
 * than vanishing silently.
 *
 * Which ranking signals a candidate carries is driven by its record type's declared `recall` policy, looked up in the
 * schema of the KB the hit came from (`schemas`, keyed by KB root path). A KB absent from `schemas` — and any record
 * type the schema does not declare — resolves against the bundled default schema and the `freshness` policy.
 */
export async function normalizeHits(input: {
  hits: RawHit[];
  filters: RecallFilters;
  now: Date;
  warnings?: string[];
  schemas?: ReadonlyMap<string, Schema>;
}): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  for (const hit of input.hits) {
    const parsed = await parseNoteSafely(hit.path);
    if (parsed.note === null) {
      input.warnings?.push(`note at "${hit.path}" could not be read: ${parsed.error}`);
      continue;
    }
    const note = parsed.note;
    if (!passesFilters({ note, path: hit.path, filters: input.filters })) {
      continue;
    }
    const recall = resolveRecallPolicy({ schemas: input.schemas, hit, note });
    candidates.push(await toCandidate({ hit, note, now: input.now, recall }));
  }
  stampOccurrences(candidates);
  return candidates;
}

// region | Helpers

/**
 * Resolves the recall policy that governs a hit's ranking signals: the note's `recordType` looked up in its KB's
 * schema. Falls back to `freshness` when the KB has no entry in `schemas`, when the record type is undeclared, or
 * when the frontmatter is unreadable (no `recordType`) — so an unrecognized or absent policy degrades to the most
 * general signal rather than emitting none.
 */
function resolveRecallPolicy(input: {
  schemas: ReadonlyMap<string, Schema> | undefined;
  hit: RawHit;
  note: ParsedNote;
}): string {
  const schema = input.schemas?.get(input.hit.kbPath) ?? defaultSchema;
  const recordType = input.note.frontmatter?.recordType ?? '';
  return schema.recordTypes[recordType]?.recall ?? FRESHNESS;
}

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

/** Reads a string-valued field from a frontmatter `extra` map; `null` when absent or non-string. */
function extractString(extra: Record<string, unknown> | undefined, key: string): string | null {
  if (extra === undefined) {
    return null;
  }
  const value = extra[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** The outcome of a guarded note parse: the parsed note, or a `null` note paired with the read/parse error message. */
type SafeParseOutcome = { note: ParsedNote } | { note: null; error: string };

/** Parse a note from disk, returning a `null` note plus the error message when the file cannot be read. */
async function parseNoteSafely(path: string): Promise<SafeParseOutcome> {
  try {
    return { note: await parseNote({ path }) };
  } catch (error) {
    return { note: null, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Applies the mechanical `--diataxis`, `--tag`, and `--folder` filters. A note with no parseable frontmatter fails
 * `--diataxis` and `--tag` (it carries no typed fields) but is still subject to the path-based `--folder` filter.
 */
function passesFilters(input: { note: ParsedNote; path: string; filters: RecallFilters }): boolean {
  const { note, path, filters } = input;

  if (filters.folder !== undefined && !path.toLowerCase().includes(`/${filters.folder.toLowerCase()}/`)) {
    return false;
  }

  const frontmatter = note.frontmatter;
  if (
    filters.diataxis !== undefined &&
    extractString(frontmatter?.extra, 'diataxis')?.toLowerCase() !== filters.diataxis.toLowerCase()
  ) {
    return false;
  }
  if (filters.tag !== undefined) {
    const wanted = filters.tag.toLowerCase();
    const tags = frontmatter?.tags ?? [];
    if (!tags.some((tag) => tag.toLowerCase() === wanted)) {
      return false;
    }
  }
  return true;
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

  const candidate: Candidate = {
    path: hit.path,
    title,
    diataxis,
    tags,
    snippet: hit.snippet,
    lastVerifiedAgeDays,
    supersession,
    kbName: hit.kbName,
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
