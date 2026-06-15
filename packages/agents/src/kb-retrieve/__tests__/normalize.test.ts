import { join } from 'node:path';

import type { RecordTypeSchema, Schema } from '@codeassembly/kb';
import { describe, expect, it } from 'vitest';

import { normalizeHits } from '../normalize.ts';
import type { RawHit } from '../types.ts';

const NOTES_VAULT = join(import.meta.dirname, 'fixtures', 'notes-vault');
const NORMALIZE = join(import.meta.dirname, 'fixtures', 'normalize');
const EVENTS = join(import.meta.dirname, 'fixtures', 'events');
// A fixed clock so freshness ages are deterministic across test runs.
const NOW = new Date('2026-05-01T00:00:00Z');

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
      diataxis: 'howto',
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
    expect(candidates[0]?.diataxis).toBeNull();
    expect(candidates[0]?.title).toBe('malformed.md');
    expect(candidates[0]?.diagnostic).toMatch(/malformed/);
  });

  it('keeps only notes matching the --diataxis filter', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NOTES_VAULT, 'streams.md')), hitFor(join(NOTES_VAULT, 'sub', 'hooks.md'))],
      filters: { diataxis: 'reference' },
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

  it('surfaces a warning for a hit whose note file cannot be read', async () => {
    const warnings: string[] = [];
    const missingPath = join(NOTES_VAULT, 'no-such-note.md');

    const candidates = await normalizeHits({
      hits: [hitFor(missingPath)],
      filters: {},
      now: NOW,
      warnings,
    });

    expect(candidates).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`note at "${missingPath}" could not be read`);
  });
});

describe('normalizeHits over event records', () => {
  it('surfaces an event summary as the candidate title rather than the ULID basename', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(EVENTS, 'event-a.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates[0]?.title).toBe('Noticed a flaky retry under fake timers');
  });

  it('carries captured-at and repo onto an event candidate', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(EVENTS, 'event-a.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates[0]?.capturedAt).toBe('2026-05-20T10:00:00.000Z');
    expect(candidates[0]?.repo).toBe('owner/repo-x');
  });

  it('does not set event signals on a non-event note', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NOTES_VAULT, 'new-guide.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates[0]?.capturedAt).toBeUndefined();
    expect(candidates[0]?.repo).toBeUndefined();
    expect(candidates[0]?.occurrences).toBeUndefined();
  });

  it('stamps occurrences with the size of each repo recurrence group', async () => {
    const candidates = await normalizeHits({
      hits: [
        hitFor(join(EVENTS, 'event-a.md')),
        hitFor(join(EVENTS, 'event-b.md')),
        hitFor(join(EVENTS, 'event-c.md')),
      ],
      filters: {},
      now: NOW,
    });

    const byTitle = new Map(candidates.map((candidate) => [candidate.title, candidate.occurrences]));
    // event-a and event-b share owner/repo-x (group size 2); event-c is alone in owner/repo-y.
    expect(byTitle.get('Noticed a flaky retry under fake timers')).toBe(2);
    expect(byTitle.get('Another observation in the same repo')).toBe(2);
    expect(byTitle.get('An event in a different repo')).toBe(1);
  });

  it('stamps a lone no-repo event with occurrences 1', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(EVENTS, 'event-no-repo-a.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates[0]?.repo).toBeUndefined();
    expect(candidates[0]?.occurrences).toBe(1);
  });

  it('groups two no-repo events into a shared empty-repo recurrence group', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(EVENTS, 'event-no-repo-a.md')), hitFor(join(EVENTS, 'event-no-repo-b.md'))],
      filters: {},
      now: NOW,
    });

    const byTitle = new Map(candidates.map((candidate) => [candidate.title, candidate.occurrences]));
    expect(byTitle.get('An observation captured outside a git remote')).toBe(2);
    expect(byTitle.get('Another observation captured outside a git remote')).toBe(2);
  });

  it('keeps only events whose extra diataxis matches the --diataxis filter, dropping events with no extra diataxis', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(EVENTS, 'event-typed-a.md')), hitFor(join(EVENTS, 'event-c.md'))],
      filters: { diataxis: 'observation' },
      now: NOW,
    });

    expect(candidates.map((candidate) => candidate.title)).toEqual(['A typed event carrying a Diataxis label']);
  });
});

describe('normalizeHits addressed-by surfacing', () => {
  it("carries an event's addressed-by list onto the candidate", async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(EVENTS, 'event-addressed.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates[0]?.addressedBy).toEqual(['abc1234', 'owner/repo-x#42', 'https://example.com/fix']);
  });

  it('omits addressedBy when the note declares no addressed-by', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NOTES_VAULT, 'new-guide.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates[0]?.addressedBy).toBeUndefined();
  });

  it('coerces a scalar addressed-by to a one-element list', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NORMALIZE, 'addressed-by-scalar.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates[0]?.addressedBy).toEqual(['owner/repo#7']);
  });

  it('drops non-string items from an addressed-by list', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(NORMALIZE, 'addressed-by-mixed.md'))],
      filters: {},
      now: NOW,
    });

    expect(candidates[0]?.addressedBy).toEqual(['#1', '#2']);
  });
});

describe('normalizeHits with a schema-driven recall policy', () => {
  const CUSTOM_RECORD = join(NORMALIZE, 'custom-record.md');

  it('treats an event record as freshness-ranked when its schema declares recall: freshness', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(EVENTS, 'event-a.md'))],
      filters: {},
      now: NOW,
      schemas: schemasFor({ event: recall('freshness') }),
    });

    // The recall knob, flipped: an event whose record type declares freshness sheds its recurrence signals.
    expect(candidates[0]?.capturedAt).toBeUndefined();
    expect(candidates[0]?.repo).toBeUndefined();
    expect(candidates[0]?.occurrences).toBeUndefined();
    expect(candidates[0]?.title).toBe('event-a.md');
  });

  it('emits recurrence signals for a custom record type whose policy is recurrence-recency', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(CUSTOM_RECORD)],
      filters: {},
      now: NOW,
      schemas: schemasFor({ insight: recall('recurrence-recency') }),
    });

    expect(candidates[0]?.capturedAt).toBe('2026-05-22T10:00:00.000Z');
    expect(candidates[0]?.repo).toBe('owner/repo-custom');
    expect(candidates[0]?.occurrences).toBe(1);
    expect(candidates[0]?.title).toBe('A custom insight surfaced during review');
    expect(candidates[0]?.lastVerifiedAgeDays).toBeNull();
  });

  it('emits a freshness age for a custom record type whose policy is freshness', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(CUSTOM_RECORD)],
      filters: {},
      now: NOW,
      schemas: schemasFor({ insight: recall('freshness') }),
    });

    // 2026-04-10 to 2026-05-01 is 21 days.
    expect(candidates[0]?.lastVerifiedAgeDays).toBe(21);
    expect(candidates[0]?.capturedAt).toBeUndefined();
    expect(candidates[0]?.title).toBe('A custom insight record');
  });

  it('falls back to freshness for an unrecognized recall policy', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(CUSTOM_RECORD)],
      filters: {},
      now: NOW,
      schemas: schemasFor({ insight: recall('hand-curated') }),
    });

    expect(candidates[0]?.lastVerifiedAgeDays).toBe(21);
    expect(candidates[0]?.capturedAt).toBeUndefined();
  });

  it('falls back to freshness for a record type the schema does not declare', async () => {
    const candidates = await normalizeHits({
      hits: [hitFor(join(EVENTS, 'event-a.md'))],
      filters: {},
      now: NOW,
      schemas: schemasFor({}),
    });

    expect(candidates[0]?.capturedAt).toBeUndefined();
    expect(candidates[0]?.occurrences).toBeUndefined();
  });

  it('emits no ranking signal for a recurrence-recency record that lacks captured-at', async () => {
    // streams.md carries neither captured-at nor last-verified; under recurrence-recency it has no recency timestamp
    // to rank on, and freshness is suppressed — the intentional "no signal" edge.
    const candidates = await normalizeHits({
      hits: [hitFor(join(NOTES_VAULT, 'streams.md'))],
      filters: {},
      now: NOW,
      schemas: schemasFor({ assertion: recall('recurrence-recency') }),
    });

    expect(candidates[0]?.capturedAt).toBeUndefined();
    expect(candidates[0]?.repo).toBeUndefined();
    expect(candidates[0]?.occurrences).toBeUndefined();
    expect(candidates[0]?.lastVerifiedAgeDays).toBeNull();
  });
});

/** Builds a `RawHit` for a fixture note path. */
function hitFor(path: string): RawHit {
  return { path, kbName: 'fixtures', kbPath: NOTES_VAULT, snippet: 'snippet text' };
}

/** Builds a minimal record-type schema declaring only a recall policy. */
function recall(policy: string): RecordTypeSchema {
  return { required: [], optional: [], recall: policy };
}

/** Wraps a record-type vocabulary as a schema keyed to the fixture KB path used by `hitFor`. */
function schemasFor(recordTypes: Record<string, RecordTypeSchema>): ReadonlyMap<string, Schema> {
  return new Map([[NOTES_VAULT, { recordTypes }]]);
}
