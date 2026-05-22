import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { recallNotes } from '../recall.ts';
import type { ScopedKb } from '../types.ts';

const NOTES_VAULT = join(import.meta.dirname, 'fixtures', 'notes-vault');

const notesVaultScope: ScopedKb[] = [{ name: 'notes', path: NOTES_VAULT, via: 'discovery' }];

/** Collect the basenames of the matched note paths for order-independent assertions. */
function matchedBasenames(hits: ReadonlyArray<{ path: string }>): string[] {
  return hits.map((hit) => hit.path.split('/').at(-1) ?? '').toSorted();
}

describe(recallNotes, () => {
  it('returns notes whose body contains a query term', async () => {
    const hits = await recallNotes({ query: 'backpressure', scopedKbs: notesVaultScope });

    expect(matchedBasenames(hits)).toEqual(['streams.md']);
  });

  it('returns a note stored under a digit-prefixed directory', async () => {
    // A path segment such as `2024-archive` must not be misread as a ripgrep content line.
    const hits = await recallNotes({ query: 'quobble', scopedKbs: notesVaultScope });

    expect(matchedBasenames(hits)).toEqual(['legacy-runbook.md']);
  });

  it('returns a note whose filename is date-patterned', async () => {
    // A filename such as `2026-05-01-meeting-notes.md` must not have its `-05-` run misread
    // as the ripgrep line-number field.
    const hits = await recallNotes({ query: 'flummox', scopedKbs: notesVaultScope });

    expect(matchedBasenames(hits)).toEqual(['2026-05-01-meeting-notes.md']);
  });

  it('returns a note stored under a date-patterned directory', async () => {
    // A directory such as `2026-06-01` must not have its `-06-` run misread as the
    // ripgrep line-number field.
    const hits = await recallNotes({ query: 'grumbletwist', scopedKbs: notesVaultScope });

    expect(matchedBasenames(hits)).toEqual(['daily-log.md']);
  });

  it('attributes each hit to its source KB name and path', async () => {
    const hits = await recallNotes({ query: 'backpressure', scopedKbs: notesVaultScope });

    expect(hits[0]?.kbName).toBe('notes');
    expect(hits[0]?.kbPath).toBe(NOTES_VAULT);
  });

  it('propagates a null kbName for a discovered KB with no registry entry', async () => {
    const scope: ScopedKb[] = [{ name: null, path: NOTES_VAULT, via: 'discovery' }];
    const hits = await recallNotes({ query: 'backpressure', scopedKbs: scope });

    expect(hits[0]?.kbName).toBeNull();
  });

  it('treats each query term disjunctively', async () => {
    const hits = await recallNotes({ query: 'backpressure dependency', scopedKbs: notesVaultScope });

    expect(matchedBasenames(hits)).toEqual(['hooks.md', 'streams.md']);
  });

  it('expands an alias query term to its canonical tag', async () => {
    // "node" is an alias for the canonical tag "nodejs"; the streams note is tagged "nodejs" only.
    const hits = await recallNotes({ query: 'node', scopedKbs: notesVaultScope });

    expect(matchedBasenames(hits)).toContain('streams.md');
  });

  it('returns an empty array when no note matches', async () => {
    const hits = await recallNotes({ query: 'zzzznomatch', scopedKbs: notesVaultScope });

    expect(hits).toEqual([]);
  });

  it('returns an empty array for a blank query', async () => {
    const hits = await recallNotes({ query: '   ', scopedKbs: notesVaultScope });

    expect(hits).toEqual([]);
  });

  it('captures a context snippet for each matched note', async () => {
    const hits = await recallNotes({ query: 'backpressure', scopedKbs: notesVaultScope });

    expect(hits[0]?.snippet).toContain('backpressure');
  });

  it('skips a scoped KB whose path does not exist on disk', async () => {
    const scope: ScopedKb[] = [
      { name: 'missing', path: join(NOTES_VAULT, 'no-such-dir'), via: 'registry-all' },
      ...notesVaultScope,
    ];
    const hits = await recallNotes({ query: 'backpressure', scopedKbs: scope });

    expect(matchedBasenames(hits)).toEqual(['streams.md']);
  });
});
