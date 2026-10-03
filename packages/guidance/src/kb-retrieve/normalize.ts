import { basename, dirname, isAbsolute, resolve } from 'node:path';

import type { ParsedNote } from '@williamthorsen/kb/frontmatter';

import type { RawHit, SearchHit } from '../kb-search/types.ts';
import { computeAgeDays, extractString, parseNoteSafely, readStringList } from '../kb-shared/note-helpers.ts';
import type { AssertionCandidate, Supersession } from './types.ts';

const MAX_SUPERSESSION_HOPS = 32;

/** Projects the shared search primitive's parsed hits onto the assertion candidate table. */
export async function normalizeHits(input: { hits: SearchHit[]; now: Date }): Promise<AssertionCandidate[]> {
  const candidates: AssertionCandidate[] = [];
  for (const { hit, note } of input.hits) {
    candidates.push(await toCandidate({ hit, note, now: input.now }));
  }
  return candidates;
}

// region | Helpers

/**
 * Follows a note's `superseded-by` chain to its canonical successor. On a defective chain it stops early, reporting
 * the furthest successor that it reached and a `diagnostic` naming the defect.
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
 * Projects a parsed note and its hit metadata onto an assertion candidate. A note whose frontmatter is missing or
 * malformed yields a low-signal candidate with a `diagnostic`.
 */
async function toCandidate(input: { hit: RawHit; note: ParsedNote; now: Date }): Promise<AssertionCandidate> {
  const { hit, note, now } = input;
  const frontmatter = note.frontmatter;
  const extra = frontmatter?.extra;

  const title = frontmatter !== null && frontmatter.title !== '' ? frontmatter.title : basename(hit.path);
  const diataxis = extractString(extra, 'diataxis');
  const tags = frontmatter?.tags ?? [];
  const lastVerifiedAgeDays = computeAgeDays(extractString(extra, 'last-verified'), now);
  const supersession = await resolveSupersession({ path: hit.path, note });
  const addressedBy = readStringList(extra, 'addressed-by');

  const candidate: AssertionCandidate = {
    path: hit.path,
    title,
    diataxis,
    tags,
    snippet: hit.snippet,
    lastVerifiedAgeDays,
    supersession,
    kbName: hit.kbName,
    ...(addressedBy.length > 0 && { addressedBy }),
  };
  if (frontmatter === null) {
    candidate.diagnostic = 'frontmatter missing or malformed; degraded to a low-signal candidate';
  }
  return candidate;
}

// endregion | Helpers
