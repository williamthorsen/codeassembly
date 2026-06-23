import { join } from 'node:path';

import { parseNote } from '@codeassembly/kb/frontmatter';
import { describe, expect, it } from 'vitest';

import type { SearchHit } from '../../kb-search/types.ts';
import { normalizeHits } from '../normalize.ts';

// The vault and event fixtures live with the shared search primitive; the normalize-specific notes stay local.
const SEARCH_FIXTURES = join(import.meta.dirname, '..', '..', 'kb-search', '__tests__', 'fixtures');
const NOTES_VAULT = join(SEARCH_FIXTURES, 'notes-vault');
const EVENTS = join(SEARCH_FIXTURES, 'events');
const NORMALIZE = join(import.meta.dirname, 'fixtures', 'normalize');
// A fixed clock so freshness ages are deterministic across test runs.
const NOW = new Date('2026-05-01T00:00:00Z');

describe(normalizeHits, () => {
  it('projects a well-formed note onto a candidate carrying its frontmatter fields', async () => {
    const candidates = await normalizeHits({ hits: [await freshHit(join(NOTES_VAULT, 'new-guide.md'))], now: NOW });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      title: 'Current deployment guide',
      diataxis: 'howto',
      tags: ['deploy', 'stable'],
    });
  });

  it('computes last-verified age in whole days against now', async () => {
    const candidates = await normalizeHits({ hits: [await freshHit(join(NOTES_VAULT, 'new-guide.md'))], now: NOW });

    // 2026-04-15 to 2026-05-01 is 16 days.
    expect(candidates[0]?.lastVerifiedAgeDays).toBe(16);
  });

  it('reports a null last-verified age when the field is absent', async () => {
    const candidates = await normalizeHits({ hits: [await freshHit(join(NOTES_VAULT, 'streams.md'))], now: NOW });

    expect(candidates[0]?.lastVerifiedAgeDays).toBeNull();
  });

  it('reports a null last-verified age when the field is not a parseable date', async () => {
    const candidates = await normalizeHits({
      hits: [await freshHit(join(NORMALIZE, 'unparseable-date.md'))],
      now: NOW,
    });

    expect(candidates[0]?.lastVerifiedAgeDays).toBeNull();
  });

  it('follows a multi-hop superseded-by chain to the canonical successor', async () => {
    const candidates = await normalizeHits({ hits: [await freshHit(join(NOTES_VAULT, 'old-guide.md'))], now: NOW });

    expect(candidates[0]?.supersession).toEqual({
      superseded: true,
      canonicalPath: join(NOTES_VAULT, 'new-guide.md'),
    });
  });

  it('reports superseded: false for a note with no successor', async () => {
    const candidates = await normalizeHits({ hits: [await freshHit(join(NOTES_VAULT, 'new-guide.md'))], now: NOW });

    expect(candidates[0]?.supersession).toEqual({ superseded: false, canonicalPath: null });
  });

  it('terminates a superseded-by cycle and reports it in a diagnostic', async () => {
    const candidates = await normalizeHits({ hits: [await freshHit(join(NORMALIZE, 'cycle-a.md'))], now: NOW });

    expect(candidates[0]?.supersession.superseded).toBe(true);
    expect(candidates[0]?.supersession.diagnostic).toMatch(/cycle/);
  });

  it('reports a dangling superseded-by target with a null canonical path', async () => {
    const candidates = await normalizeHits({ hits: [await freshHit(join(NORMALIZE, 'dangling.md'))], now: NOW });

    expect(candidates[0]?.supersession).toMatchObject({ superseded: true, canonicalPath: null });
    expect(candidates[0]?.supersession.diagnostic).toMatch(/not readable/);
  });

  it('degrades a malformed-frontmatter note to a low-signal candidate', async () => {
    const candidates = await normalizeHits({ hits: [await freshHit(join(NORMALIZE, 'malformed.md'))], now: NOW });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.diataxis).toBeNull();
    expect(candidates[0]?.title).toBe('malformed.md');
    expect(candidates[0]?.diagnostic).toMatch(/malformed/);
  });
});

describe('normalizeHits over event records', () => {
  it('surfaces an event summary as the candidate title rather than the ULID basename', async () => {
    const candidates = await normalizeHits({ hits: [await eventHit(join(EVENTS, 'event-a.md'))], now: NOW });

    expect(candidates[0]?.title).toBe('Noticed a flaky retry under fake timers');
  });

  it('carries captured-at and repo onto an event candidate', async () => {
    const candidates = await normalizeHits({ hits: [await eventHit(join(EVENTS, 'event-a.md'))], now: NOW });

    expect(candidates[0]?.capturedAt).toBe('2026-05-20T10:00:00.000Z');
    expect(candidates[0]?.repo).toBe('owner/repo-x');
  });

  it('does not set event signals on a freshness-ranked note', async () => {
    const candidates = await normalizeHits({ hits: [await freshHit(join(NOTES_VAULT, 'new-guide.md'))], now: NOW });

    expect(candidates[0]?.capturedAt).toBeUndefined();
    expect(candidates[0]?.repo).toBeUndefined();
    expect(candidates[0]?.occurrences).toBeUndefined();
  });

  it('stamps occurrences with the size of each repo recurrence group', async () => {
    const candidates = await normalizeHits({
      hits: [
        await eventHit(join(EVENTS, 'event-a.md')),
        await eventHit(join(EVENTS, 'event-b.md')),
        await eventHit(join(EVENTS, 'event-c.md')),
      ],
      now: NOW,
    });

    const byTitle = new Map(candidates.map((candidate) => [candidate.title, candidate.occurrences]));
    // event-a and event-b share owner/repo-x (group size 2); event-c is alone in owner/repo-y.
    expect(byTitle.get('Noticed a flaky retry under fake timers')).toBe(2);
    expect(byTitle.get('Another observation in the same repo')).toBe(2);
    expect(byTitle.get('An event in a different repo')).toBe(1);
  });

  it('stamps a lone no-repo event with occurrences 1', async () => {
    const candidates = await normalizeHits({ hits: [await eventHit(join(EVENTS, 'event-no-repo-a.md'))], now: NOW });

    expect(candidates[0]?.repo).toBeUndefined();
    expect(candidates[0]?.occurrences).toBe(1);
  });

  it('groups two no-repo events into a shared empty-repo recurrence group', async () => {
    const candidates = await normalizeHits({
      hits: [await eventHit(join(EVENTS, 'event-no-repo-a.md')), await eventHit(join(EVENTS, 'event-no-repo-b.md'))],
      now: NOW,
    });

    const byTitle = new Map(candidates.map((candidate) => [candidate.title, candidate.occurrences]));
    expect(byTitle.get('An observation captured outside a git remote')).toBe(2);
    expect(byTitle.get('Another observation captured outside a git remote')).toBe(2);
  });
});

describe('normalizeHits addressed-by surfacing', () => {
  it("carries an event's addressed-by list alongside its recurrence signals", async () => {
    const candidates = await normalizeHits({ hits: [await eventHit(join(EVENTS, 'event-addressed.md'))], now: NOW });

    expect(candidates[0]).toMatchObject({
      capturedAt: '2026-05-23T10:00:00.000Z',
      repo: 'owner/repo-x',
      addressedBy: ['abc1234', 'owner/repo-x#42', 'https://example.com/fix'],
    });
  });

  it('omits addressedBy when the note declares no addressed-by', async () => {
    const candidates = await normalizeHits({ hits: [await freshHit(join(NOTES_VAULT, 'new-guide.md'))], now: NOW });

    expect(candidates[0]?.addressedBy).toBeUndefined();
  });

  it('coerces a scalar addressed-by to a one-element list', async () => {
    const candidates = await normalizeHits({
      hits: [await freshHit(join(NORMALIZE, 'addressed-by-scalar.md'))],
      now: NOW,
    });

    expect(candidates[0]?.addressedBy).toEqual(['owner/repo#7']);
  });

  it('drops non-string items from an addressed-by list', async () => {
    const candidates = await normalizeHits({
      hits: [await freshHit(join(NORMALIZE, 'addressed-by-mixed.md'))],
      now: NOW,
    });

    expect(candidates[0]?.addressedBy).toEqual(['#1', '#2']);
  });
});

describe('normalizeHits projection under a given recall policy', () => {
  const CUSTOM_RECORD = join(NORMALIZE, 'custom-record.md');

  it('sheds recurrence signals when the hit is freshness-ranked', async () => {
    const candidates = await normalizeHits({ hits: [await hitFor(join(EVENTS, 'event-a.md'), 'freshness')], now: NOW });

    // The recall knob, flipped: an event projected as freshness sheds its recurrence signals.
    expect(candidates[0]?.capturedAt).toBeUndefined();
    expect(candidates[0]?.repo).toBeUndefined();
    expect(candidates[0]?.occurrences).toBeUndefined();
    expect(candidates[0]?.title).toBe('event-a.md');
  });

  it('emits recurrence signals for a recurrence-recency hit', async () => {
    const candidates = await normalizeHits({ hits: [await hitFor(CUSTOM_RECORD, 'recurrence-recency')], now: NOW });

    expect(candidates[0]?.capturedAt).toBe('2026-05-22T10:00:00.000Z');
    expect(candidates[0]?.repo).toBe('owner/repo-custom');
    expect(candidates[0]?.occurrences).toBe(1);
    expect(candidates[0]?.title).toBe('A custom insight surfaced during review');
    expect(candidates[0]?.lastVerifiedAgeDays).toBeNull();
  });

  it('emits a freshness age for a freshness hit', async () => {
    const candidates = await normalizeHits({ hits: [await hitFor(CUSTOM_RECORD, 'freshness')], now: NOW });

    // 2026-04-10 to 2026-05-01 is 21 days.
    expect(candidates[0]?.lastVerifiedAgeDays).toBe(21);
    expect(candidates[0]?.capturedAt).toBeUndefined();
    expect(candidates[0]?.title).toBe('A custom insight record');
  });

  it('treats any non-recurrence-recency policy as freshness', async () => {
    const candidates = await normalizeHits({ hits: [await hitFor(CUSTOM_RECORD, 'hand-curated')], now: NOW });

    expect(candidates[0]?.lastVerifiedAgeDays).toBe(21);
    expect(candidates[0]?.capturedAt).toBeUndefined();
  });

  it('emits no ranking signal for a recurrence-recency hit that lacks captured-at', async () => {
    // streams.md carries neither captured-at nor last-verified; under recurrence-recency it has no recency timestamp
    // to rank on, and freshness is suppressed — the intentional "no signal" edge.
    const candidates = await normalizeHits({
      hits: [await hitFor(join(NOTES_VAULT, 'streams.md'), 'recurrence-recency')],
      now: NOW,
    });

    expect(candidates[0]?.capturedAt).toBeUndefined();
    expect(candidates[0]?.repo).toBeUndefined();
    expect(candidates[0]?.occurrences).toBeUndefined();
    expect(candidates[0]?.lastVerifiedAgeDays).toBeNull();
  });
});

/** Builds a `SearchHit` for a fixture note, parsing it and assigning the given recall policy. */
async function hitFor(path: string, recall: string): Promise<SearchHit> {
  return {
    hit: { path, kbName: 'fixtures', kbPath: NOTES_VAULT, snippet: 'snippet text' },
    note: await parseNote({ path }),
    recall,
  };
}

/** A freshness-ranked hit — the assertion projection. */
function freshHit(path: string): Promise<SearchHit> {
  return hitFor(path, 'freshness');
}

/** A recurrence-recency hit — the event projection. */
function eventHit(path: string): Promise<SearchHit> {
  return hitFor(path, 'recurrence-recency');
}
