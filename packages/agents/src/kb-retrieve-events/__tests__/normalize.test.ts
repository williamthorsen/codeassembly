import { join } from 'node:path';

import { parseNote } from '@codeassembly/kb/frontmatter';
import { describe, expect, it } from 'vitest';

import type { SearchHit } from '../../kb-search/types.ts';
import { normalizeEvents } from '../normalize.ts';

// The event fixtures live with the shared search primitive.
const EVENTS = join(import.meta.dirname, '..', '..', 'kb-search', '__tests__', 'fixtures', 'events');

describe(normalizeEvents, () => {
  it('surfaces an event summary as the candidate display field', async () => {
    const candidates = normalizeEvents({ hits: [await hitFor(join(EVENTS, 'event-a.md'))] });

    expect(candidates[0]?.summary).toBe('Noticed a flaky retry under fake timers');
  });

  it('carries captured-at and repo onto an event candidate', async () => {
    const candidates = normalizeEvents({ hits: [await hitFor(join(EVENTS, 'event-a.md'))] });

    expect(candidates[0]?.capturedAt).toBe('2026-05-20T10:00:00.000Z');
    expect(candidates[0]?.repo).toBe('owner/repo-x');
  });

  it('stamps occurrences with the size of each repo recurrence group', async () => {
    const candidates = normalizeEvents({
      hits: [
        await hitFor(join(EVENTS, 'event-a.md')),
        await hitFor(join(EVENTS, 'event-b.md')),
        await hitFor(join(EVENTS, 'event-c.md')),
      ],
    });

    const bySummary = new Map(candidates.map((candidate) => [candidate.summary, candidate.occurrences]));
    // event-a and event-b share owner/repo-x (group size 2); event-c is alone in owner/repo-y.
    expect(bySummary.get('Noticed a flaky retry under fake timers')).toBe(2);
    expect(bySummary.get('Another observation in the same repo')).toBe(2);
    expect(bySummary.get('An event in a different repo')).toBe(1);
  });

  it('stamps a lone no-repo event with occurrences 1', async () => {
    const candidates = normalizeEvents({ hits: [await hitFor(join(EVENTS, 'event-no-repo-a.md'))] });

    expect(candidates[0]?.repo).toBeUndefined();
    expect(candidates[0]?.occurrences).toBe(1);
  });

  it('groups two no-repo events into a shared empty-repo recurrence group', async () => {
    const candidates = normalizeEvents({
      hits: [await hitFor(join(EVENTS, 'event-no-repo-a.md')), await hitFor(join(EVENTS, 'event-no-repo-b.md'))],
    });

    const bySummary = new Map(candidates.map((candidate) => [candidate.summary, candidate.occurrences]));
    expect(bySummary.get('An observation captured outside a git remote')).toBe(2);
    expect(bySummary.get('Another observation captured outside a git remote')).toBe(2);
  });

  it("carries an event's addressed-by list alongside its recurrence signals", async () => {
    const candidates = normalizeEvents({ hits: [await hitFor(join(EVENTS, 'event-addressed.md'))] });

    expect(candidates[0]).toMatchObject({
      capturedAt: '2026-05-23T10:00:00.000Z',
      repo: 'owner/repo-x',
      addressedBy: ['abc1234', 'owner/repo-x#42', 'https://example.com/fix'],
    });
  });
});

/** Builds a `SearchHit` for a fixture event by parsing it. */
async function hitFor(path: string): Promise<SearchHit> {
  return {
    hit: { path, kbName: 'events', kbPath: EVENTS, snippet: 'snippet text' },
    note: await parseNote({ path }),
  };
}
