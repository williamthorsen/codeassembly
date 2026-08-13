import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { buildRecallStub } from '../../test-utils/build-recall-stub.ts';
import type { RecallFn } from '../recall.ts';
import { searchNotes } from '../search.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const NOTES_VAULT = join(FIXTURES, 'notes-vault');

describe(searchNotes, () => {
  it('returns hits carrying the parsed note, so a command can select by recordType and project its own shape', async () => {
    const result = await searchNotes({
      query: 'backpressure',
      allKbs: false,
      filters: {},
      startDir: NOTES_VAULT,
      home: FIXTURES,
      recall: buildRecallStub({ hits: [notePath('streams.md')] }),
    });

    const streams = result.hits.find((hit) => hit.hit.path.endsWith('streams.md'));
    expect(streams).toBeDefined();
    expect(streams?.note.frontmatter?.recordType).toBe('assertion');
    expect(streams?.note.frontmatter?.title).toBe('Working with Node.js streams');
  });

  it('applies the mechanical --diataxis filter, reporting the pre-filter hit count in recalledCount', async () => {
    const result = await searchNotes({
      query: 'deployment',
      allKbs: false,
      filters: { diataxis: 'howto' },
      startDir: NOTES_VAULT,
      home: FIXTURES,
      recall: buildRecallStub({
        hits: [notePath('new-guide.md'), notePath('mid-guide.md'), notePath('sub/hooks.md')],
      }),
    });

    expect(result.hits.every((hit) => hit.note.frontmatter?.extra.diataxis === 'howto')).toBe(true);
    expect(result.hits).toHaveLength(2);
    expect(result.recalledCount).toBe(3);
  });

  it('returns no hits but a positive recalledCount when a filter excludes every match', async () => {
    const result = await searchNotes({
      query: 'backpressure',
      allKbs: false,
      filters: { folder: 'zzz-nonexistent' },
      startDir: NOTES_VAULT,
      home: FIXTURES,
      recall: buildRecallStub({ hits: [notePath('streams.md')] }),
    });

    expect(result.hits).toEqual([]);
    expect(result.recalledCount).toBe(1);
  });

  it('sets an empty-scope diagnostic and recalls nothing for an unregistered store', async () => {
    const recall = vi.fn<RecallFn>(buildRecallStub({ hits: [notePath('streams.md')] }));

    const result = await searchNotes({
      query: 'anything',
      allKbs: false,
      storeName: 'no-such-store',
      filters: {},
      startDir: NOTES_VAULT,
      home: FIXTURES,
      recall,
    });

    expect(result.hits).toEqual([]);
    expect(result.scopedKbs).toEqual([]);
    expect(result.emptyScopeDiagnostic).toMatch(/not registered/);
    expect(recall).not.toHaveBeenCalled();
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
      recall: buildRecallStub({ hits: [notePath('streams.md'), notePath('new-guide.md')] }),
    });

    expect(result.hits.some((hit) => hit.hit.path.endsWith('streams.md'))).toBe(false);
    expect(
      result.warnings.some((warning) => warning.includes('streams.md') && warning.includes('could not be read')),
    ).toBe(true);

    vi.doUnmock('../../kb-shared/note-helpers.ts');
    vi.resetModules();
  });
});

/** Resolves a note's vault-relative name to its absolute path in the shared fixture vault. */
function notePath(name: string): string {
  return join(NOTES_VAULT, name);
}
