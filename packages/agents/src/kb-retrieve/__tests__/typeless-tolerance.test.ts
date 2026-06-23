import { join } from 'node:path';

import { parseNote } from '@codeassembly/kb/frontmatter';
import { describe, expect, it } from 'vitest';

import type { SearchHit } from '../../kb-search/types.ts';
import { collectTypelessCandidates } from '../typeless-tolerance.ts';

const NORMALIZE = join(import.meta.dirname, 'fixtures', 'normalize');
const NOW = new Date('2026-05-01T00:00:00Z');

describe(collectTypelessCandidates, () => {
  it('surfaces a note that parses but declares no recordType, keeping its fields and marking it degraded', async () => {
    const candidates = await collectTypelessCandidates({
      hits: [await hitFor(join(NORMALIZE, 'no-record-type.md'))],
      now: NOW,
    });

    expect(candidates[0]?.title).toBe('A note that predates record typing');
    expect(candidates[0]?.diagnostic).toBe('note has no recordType; degraded to a low-signal candidate');
  });

  it('keeps the malformed-frontmatter diagnostic for a note with no parseable frontmatter', async () => {
    const candidates = await collectTypelessCandidates({
      hits: [await hitFor(join(NORMALIZE, 'malformed.md'))],
      now: NOW,
    });

    expect(candidates[0]?.diagnostic).toMatch(/malformed/);
  });
});

/** Builds a `SearchHit` for a fixture note by parsing it. */
async function hitFor(path: string): Promise<SearchHit> {
  return {
    hit: { path, kbName: 'fixtures', kbPath: NORMALIZE, snippet: 'snippet' },
    note: await parseNote({ path }),
    recall: 'freshness',
  };
}
