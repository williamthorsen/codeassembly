import { basename, dirname, isAbsolute, resolve } from 'node:path';

import type { ParsedNote } from '@codeassembly/kb-core/frontmatter';
import { parseNote } from '@codeassembly/kb-core/frontmatter';

import type { Candidate, RawHit, RecallFilters, Supersession } from './types.ts';

/** Whole-day divisor for converting a date delta in milliseconds to an age in days. */
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Upper bound on `superseded-by` hops, guarding against a chain cycle. */
const MAX_SUPERSESSION_HOPS = 32;

/**
 * Normalize raw ripgrep hits into the candidate table.
 *
 * Each hit's frontmatter is parsed; the `--type`, `--tag`, and `--folder` filters are applied as
 * post-filters on the parsed frontmatter and the note path; a `superseded-by` chain is followed to the
 * canonical successor with a cycle guard; and `last-verified` is converted to an age in whole days
 * against `now`. Notes with missing or malformed frontmatter degrade to a low-signal candidate carrying
 * a diagnostic rather than being dropped.
 */
export async function normalizeHits(input: {
  hits: RawHit[];
  filters: RecallFilters;
  now: Date;
}): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  for (const hit of input.hits) {
    const note = await parseNoteSafely(hit.path);
    if (note === null) {
      continue;
    }
    if (!passesFilters({ note, path: hit.path, filters: input.filters })) {
      continue;
    }
    candidates.push(await toCandidate({ hit, note, now: input.now }));
  }
  return candidates;
}

// region | Helpers

/** Parse a note from disk, returning `null` when the file cannot be read. */
async function parseNoteSafely(path: string): Promise<ParsedNote | null> {
  try {
    return await parseNote({ path });
  } catch {
    return null;
  }
}

/**
 * Apply the mechanical `--type`, `--tag`, and `--folder` filters. A note with no parseable frontmatter
 * fails `--type` and `--tag` (it carries no typed fields) but is still subject to the path-based
 * `--folder` filter.
 */
function passesFilters(input: { note: ParsedNote; path: string; filters: RecallFilters }): boolean {
  const { note, path, filters } = input;

  if (filters.folder !== undefined && !path.toLowerCase().includes(`/${filters.folder.toLowerCase()}/`)) {
    return false;
  }

  const frontmatter = note.frontmatter;
  if (
    filters.type !== undefined &&
    (frontmatter === null || frontmatter.type.toLowerCase() !== filters.type.toLowerCase())
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

/** Project a parsed note and its hit metadata onto a normalized candidate. */
async function toCandidate(input: { hit: RawHit; note: ParsedNote; now: Date }): Promise<Candidate> {
  const { hit, note, now } = input;
  const frontmatter = note.frontmatter;

  const title = frontmatter !== null && frontmatter.title !== '' ? frontmatter.title : basename(hit.path);
  const type = frontmatter !== null && frontmatter.type !== '' ? frontmatter.type : null;
  const tags = frontmatter?.tags ?? [];
  const lastVerifiedAgeDays = computeAgeDays(extractString(frontmatter?.extra, 'last-verified'), now);
  const supersession = await resolveSupersession({ path: hit.path, note });

  const candidate: Candidate = {
    path: hit.path,
    title,
    type,
    tags,
    snippet: hit.snippet,
    lastVerifiedAgeDays,
    supersession,
    kbName: hit.kbName,
  };
  if (frontmatter === null) {
    candidate.diagnostic = 'frontmatter missing or malformed; degraded to a low-signal candidate';
  }
  return candidate;
}

/**
 * Follow a note's `superseded-by` chain to its canonical successor. Each hop's frontmatter is parsed and
 * inspected for a further `superseded-by`. A repeated path or an unreadable hop ends the walk; cycles are
 * reported in the `diagnostic` field rather than throwing.
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
    if (successor === null) {
      return {
        superseded: true,
        canonicalPath,
        diagnostic: `superseded-by target not readable: ${resolvedPath}`,
      };
    }
    canonicalPath = resolvedPath;
    currentDir = dirname(resolvedPath);
    nextRef = extractString(successor.frontmatter?.extra, 'superseded-by');
  }

  if (nextRef !== null) {
    return { superseded: true, canonicalPath, diagnostic: 'superseded-by chain exceeded the hop limit' };
  }
  return { superseded: true, canonicalPath };
}

/** Compute whole days between a `YYYY-MM-DD` date string and `now`; `null` for an absent or unparseable value. */
function computeAgeDays(dateValue: string | null, now: Date): number | null {
  if (dateValue === null) {
    return null;
  }
  const parsed = Date.parse(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.floor((now.getTime() - parsed) / MILLISECONDS_PER_DAY);
}

/** Read a string-valued field from a frontmatter `extra` map; `null` when absent or non-string. */
function extractString(extra: Record<string, unknown> | undefined, key: string): string | null {
  if (extra === undefined) {
    return null;
  }
  const value = extra[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

// endregion | Helpers
