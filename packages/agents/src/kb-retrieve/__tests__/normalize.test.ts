import { join } from 'node:path';

import { parseNote } from '@codeassembly/kb/frontmatter';
import { describe, expect, it } from 'vitest';

import type { SearchHit } from '../../kb-search/types.ts';
import { normalizeHits } from '../normalize.ts';

// The vault fixtures live with the shared search primitive; the normalize-specific notes stay local.
const SEARCH_FIXTURES = join(import.meta.dirname, '..', '..', 'kb-search', '__tests__', 'fixtures');
const NOTES_VAULT = join(SEARCH_FIXTURES, 'notes-vault');
const NORMALIZE = join(import.meta.dirname, 'fixtures', 'normalize');
// A fixed clock so freshness ages are deterministic across test runs.
const NOW = new Date('2026-05-01T00:00:00Z');

describe(normalizeHits, () => {
  it('projects a well-formed note onto a candidate carrying its frontmatter fields', async () => {
    const candidates = await normalizeHits({ hits: [await hitFor(join(NOTES_VAULT, 'new-guide.md'))], now: NOW });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      title: 'Current deployment guide',
      diataxis: 'howto',
      tags: ['deploy', 'stable'],
    });
  });

  it('computes last-verified age in whole days against now', async () => {
    const candidates = await normalizeHits({ hits: [await hitFor(join(NOTES_VAULT, 'new-guide.md'))], now: NOW });

    // 2026-04-15 to 2026-05-01 is 16 days.
    expect(candidates[0]?.lastVerifiedAgeDays).toBe(16);
  });

  it('reports a null last-verified age when the field is absent', async () => {
    const candidates = await normalizeHits({ hits: [await hitFor(join(NOTES_VAULT, 'streams.md'))], now: NOW });

    expect(candidates[0]?.lastVerifiedAgeDays).toBeNull();
  });

  it('reports a null last-verified age when the field is not a parseable date', async () => {
    const candidates = await normalizeHits({ hits: [await hitFor(join(NORMALIZE, 'unparseable-date.md'))], now: NOW });

    expect(candidates[0]?.lastVerifiedAgeDays).toBeNull();
  });

  it('follows a multi-hop superseded-by chain to the canonical successor', async () => {
    const candidates = await normalizeHits({ hits: [await hitFor(join(NOTES_VAULT, 'old-guide.md'))], now: NOW });

    expect(candidates[0]?.supersession).toEqual({
      superseded: true,
      canonicalPath: join(NOTES_VAULT, 'new-guide.md'),
    });
  });

  it('reports superseded: false for a note with no successor', async () => {
    const candidates = await normalizeHits({ hits: [await hitFor(join(NOTES_VAULT, 'new-guide.md'))], now: NOW });

    expect(candidates[0]?.supersession).toEqual({ superseded: false, canonicalPath: null });
  });

  it('terminates a superseded-by cycle and reports it in a diagnostic', async () => {
    const candidates = await normalizeHits({ hits: [await hitFor(join(NORMALIZE, 'cycle-a.md'))], now: NOW });

    expect(candidates[0]?.supersession.superseded).toBe(true);
    expect(candidates[0]?.supersession.diagnostic).toMatch(/cycle/);
  });

  it('reports a dangling superseded-by target with a null canonical path', async () => {
    const candidates = await normalizeHits({ hits: [await hitFor(join(NORMALIZE, 'dangling.md'))], now: NOW });

    expect(candidates[0]?.supersession).toMatchObject({ superseded: true, canonicalPath: null });
    expect(candidates[0]?.supersession.diagnostic).toMatch(/not readable/);
  });

  it('degrades a malformed-frontmatter note to a low-signal candidate', async () => {
    const candidates = await normalizeHits({ hits: [await hitFor(join(NORMALIZE, 'malformed.md'))], now: NOW });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.diataxis).toBeNull();
    expect(candidates[0]?.title).toBe('malformed.md');
    expect(candidates[0]?.diagnostic).toMatch(/malformed/);
  });
});

describe('normalizeHits addressed-by surfacing', () => {
  it('omits addressedBy when the note declares no addressed-by', async () => {
    const candidates = await normalizeHits({ hits: [await hitFor(join(NOTES_VAULT, 'new-guide.md'))], now: NOW });

    expect(candidates[0]?.addressedBy).toBeUndefined();
  });

  it('coerces a scalar addressed-by to a one-element list', async () => {
    const candidates = await normalizeHits({
      hits: [await hitFor(join(NORMALIZE, 'addressed-by-scalar.md'))],
      now: NOW,
    });

    expect(candidates[0]?.addressedBy).toEqual(['owner/repo#7']);
  });

  it('drops non-string items from an addressed-by list', async () => {
    const candidates = await normalizeHits({
      hits: [await hitFor(join(NORMALIZE, 'addressed-by-mixed.md'))],
      now: NOW,
    });

    expect(candidates[0]?.addressedBy).toEqual(['#1', '#2']);
  });
});

/** Builds a `SearchHit` for a fixture note by parsing it. The assertion projection ignores the recall field. */
async function hitFor(path: string): Promise<SearchHit> {
  return {
    hit: { path, kbName: 'fixtures', kbPath: NOTES_VAULT, snippet: 'snippet text' },
    note: await parseNote({ path }),
  };
}
