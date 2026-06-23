import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { searchNotes } from '../search.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const NOTES_VAULT = join(FIXTURES, 'notes-vault');

describe(searchNotes, () => {
  it('returns parsed hits, each carrying the recall policy resolved from its record type', async () => {
    const result = await searchNotes({
      query: 'backpressure',
      allKbs: false,
      filters: {},
      startDir: NOTES_VAULT,
      home: FIXTURES,
    });

    const streams = result.hits.find((hit) => hit.hit.path.endsWith('streams.md'));
    expect(streams).toBeDefined();
    expect(streams?.recall).toBe('freshness');
    expect(streams?.note.frontmatter?.title).toBe('Working with Node.js streams');
  });

  it('resolves recurrence-recency for an event record under content/events/', async () => {
    const result = await searchNotes({
      query: 'phantomwidget',
      allKbs: false,
      filters: {},
      startDir: NOTES_VAULT,
      home: FIXTURES,
    });

    const event = result.hits.find((hit) => hit.hit.path.includes(join('content', 'events')));
    expect(event).toBeDefined();
    expect(event?.recall).toBe('recurrence-recency');
  });

  it('applies the mechanical --diataxis filter, reporting the pre-filter hit count in recalledCount', async () => {
    const result = await searchNotes({
      query: 'deployment',
      allKbs: false,
      filters: { diataxis: 'howto' },
      startDir: NOTES_VAULT,
      home: FIXTURES,
    });

    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits.every((hit) => hit.note.frontmatter?.extra.diataxis === 'howto')).toBe(true);
    expect(result.recalledCount).toBeGreaterThanOrEqual(result.hits.length);
  });

  it('returns no hits but a positive recalledCount when a filter excludes every match', async () => {
    const result = await searchNotes({
      query: 'backpressure',
      allKbs: false,
      filters: { folder: 'zzz-nonexistent' },
      startDir: NOTES_VAULT,
      home: FIXTURES,
    });

    expect(result.hits).toEqual([]);
    expect(result.recalledCount).toBeGreaterThan(0);
  });

  it('sets an empty-scope diagnostic and searches nothing for an unregistered store', async () => {
    const result = await searchNotes({
      query: 'anything',
      allKbs: false,
      storeName: 'no-such-store',
      filters: {},
      startDir: NOTES_VAULT,
      home: FIXTURES,
    });

    expect(result.hits).toEqual([]);
    expect(result.scopedKbs).toEqual([]);
    expect(result.emptyScopeDiagnostic).toMatch(/not registered/);
  });

  it('skips an unreadable note and surfaces a warning rather than dropping it silently', async () => {
    vi.resetModules();
    vi.doMock('../../kb-shared/note-helpers.ts', async (importActual) => {
      const actual = await importActual<typeof import('../../kb-shared/note-helpers.ts')>();
      return {
        ...actual,
        parseNoteSafely: (path: string) =>
          path.endsWith('streams.md')
            ? Promise.resolve({ note: null, error: 'simulated read failure' })
            : actual.parseNoteSafely(path),
      };
    });

    const { searchNotes: searchWithUnreadable } = await import('../search.ts');
    const result = await searchWithUnreadable({
      query: 'backpressure',
      allKbs: false,
      filters: {},
      startDir: NOTES_VAULT,
      home: FIXTURES,
    });

    expect(result.hits.some((hit) => hit.hit.path.endsWith('streams.md'))).toBe(false);
    expect(
      result.warnings.some((warning) => warning.includes('streams.md') && warning.includes('could not be read')),
    ).toBe(true);

    vi.doUnmock('../../kb-shared/note-helpers.ts');
    vi.resetModules();
  });
});
