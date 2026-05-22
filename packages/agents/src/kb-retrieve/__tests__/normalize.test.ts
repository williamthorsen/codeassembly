import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { normalizeHits } from '../normalize.ts';
import type { RawHit } from '../types.ts';

const NOTES_VAULT = join(import.meta.dirname, 'fixtures', 'notes-vault');
const NORMALIZE = join(import.meta.dirname, 'fixtures', 'normalize');
// A fixed clock so freshness ages are deterministic across test runs.
const NOW = new Date('2026-05-01T00:00:00Z');

/** Build a `RawHit` for a fixture note path. */
function hitFor(path: string): RawHit {
  return { path, kbName: 'fixtures', kbPath: NOTES_VAULT, snippet: 'snippet text' };
}

describe(normalizeHits, () => {
  it('projects a well-formed note onto a candidate carrying its frontmatter fields', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NOTES_VAULT, 'new-guide.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      title: 'Current deployment guide',
      type: 'howto',
      tags: ['deploy', 'stable'],
    });
  });

  it('computes last-verified age in whole days against now', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NOTES_VAULT, 'new-guide.md'))],
      filters: {},
      now: NOW,
    });

    // 2026-04-15 to 2026-05-01 is 16 days.
    expect(candidates[0]?.lastVerifiedAgeDays).toBe(16);
  });

  it('reports a null last-verified age when the field is absent', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NOTES_VAULT, 'streams.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates[0]?.lastVerifiedAgeDays).toBeNull();
  });

  it('reports a null last-verified age when the field is not a parseable date', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NORMALIZE, 'unparseable-date.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates[0]?.lastVerifiedAgeDays).toBeNull();
  });

  it('follows a multi-hop superseded-by chain to the canonical successor', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NOTES_VAULT, 'old-guide.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates[0]?.supersession).toEqual({
      superseded: true,
      canonicalPath: join(NOTES_VAULT, 'new-guide.md'),
    });
  });

  it('reports superseded: false for a note with no successor', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NOTES_VAULT, 'new-guide.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates[0]?.supersession).toEqual({ superseded: false, canonicalPath: null });
  });

  it('terminates a superseded-by cycle and reports it in a diagnostic', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NORMALIZE, 'cycle-a.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates[0]?.supersession.superseded).toBe(true);
    expect(candidates[0]?.supersession.diagnostic).toMatch(/cycle/);
  });

  it('reports a dangling superseded-by target with a null canonical path', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NORMALIZE, 'dangling.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates[0]?.supersession).toMatchObject({ superseded: true, canonicalPath: null });
    expect(candidates[0]?.supersession.diagnostic).toMatch(/not readable/);
  });

  it('degrades a malformed-frontmatter note to a low-signal candidate', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NORMALIZE, 'malformed.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.type).toBeNull();
    expect(candidates[0]?.title).toBe('malformed.md');
    expect(candidates[0]?.diagnostic).toMatch(/malformed/);
  });

  it('keeps only notes matching the --type filter', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NOTES_VAULT, 'streams.md')), hitFor(join(NOTES_VAULT, 'sub', 'hooks.md'))],
      filters: { type: 'reference' },
      now: NOW,
    });

    expect(candidates.map((candidate) => candidate.title)).toEqual(['React hooks reference']);
  });

  it('keeps only notes carrying the --tag filter', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NOTES_VAULT, 'streams.md')), hitFor(join(NOTES_VAULT, 'sub', 'hooks.md'))],
      filters: { tag: 'streams' },
      now: NOW,
    });

    expect(candidates.map((candidate) => candidate.title)).toEqual(['Working with Node.js streams']);
  });

  it('keeps only notes whose path contains the --folder segment', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NOTES_VAULT, 'streams.md')), hitFor(join(NOTES_VAULT, 'sub', 'hooks.md'))],
      filters: { folder: 'sub' },
      now: NOW,
    });

    expect(candidates.map((candidate) => candidate.title)).toEqual(['React hooks reference']);
  });

  it('drops a hit whose note file cannot be read', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NOTES_VAULT, 'no-such-note.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates).toEqual([]);
  });
});
