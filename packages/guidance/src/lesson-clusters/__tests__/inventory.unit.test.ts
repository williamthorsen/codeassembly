import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildExcerpt, buildInventory, EXCERPT_LIMIT } from '../inventory.ts';
import { makeStore, seedEvents } from '../test-utils/seed-store.ts';

const TRIAGE_REF = '~/ai-artifacts/feedback-triage/20261001-120000Z_triage_feedback-triage.md';

describe(buildInventory, () => {
  it('sorts feedback events into the pool and the deferred list, leaving out every other event', async () => {
    const { storePath } = await makeStore();
    await seedEvents(storePath, [
      { id: '01A-OPEN', skill: 'create-pr', repo: 'o/r', impact: 'high', body: 'First paragraph.\n\nSecond.' },
      { id: '01B-NOT-FEEDBACK', tags: ['fix'] },
      { id: '01C-TICKETED', addressedBy: ['https://github.com/o/r/issues/1'] },
      { id: '01D-OBSOLETE', tags: ['feedback', 'obsolete'] },
      { id: '01E-REJECTED', tags: ['feedback', 'rejected'] },
      { id: '01F-DEFERRED', tags: ['feedback', 'deferred'], addressedBy: [TRIAGE_REF] },
      {
        id: '01G-DEFERRED-THEN-TICKETED',
        tags: ['feedback', 'deferred'],
        addressedBy: [TRIAGE_REF, 'https://github.com/o/r/issues/2'],
      },
      { id: '01H-TRIAGE-REF-UNTAGGED', addressedBy: [TRIAGE_REF] },
    ]);

    const inventory = await buildInventory({ storeName: 'fixture', storePath });

    expect(inventory.pool).toEqual([
      {
        id: '01A-OPEN',
        summary: 'Summary of 01A-OPEN',
        skill: 'create-pr',
        repo: 'o/r',
        capturedAt: '2026-06-18T09:41:02Z',
        impact: 'high',
        excerpt: 'First paragraph.',
      },
    ]);
    expect(inventory.deferred.map((entry) => [entry.id, entry.deferredAt])).toEqual([
      ['01F-DEFERRED', '2026-10-01T12:00:00Z'],
    ]);
    expect(inventory.skipped).toEqual([]);
  });

  it('reports an event file that does not parse instead of failing', async () => {
    const { storePath } = await makeStore();
    const dir = join(storePath, 'content', 'events');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'broken.md'), '---\nrecordType: event\n---\n', 'utf8');

    const inventory = await buildInventory({ storeName: 'fixture', storePath });

    expect(inventory.pool).toEqual([]);
    expect(inventory.skipped).toHaveLength(1);
    expect(inventory.skipped[0]?.file).toBe(join(dir, 'broken.md'));
  });

  it('returns empty lists for a store without an events directory', async () => {
    const { storePath } = await makeStore();
    await expect(buildInventory({ storeName: 'fixture', storePath })).resolves.toEqual({
      store: 'fixture',
      pool: [],
      deferred: [],
      skipped: [],
    });
  });
});

describe(buildExcerpt, () => {
  it('collapses the first paragraph to one line', () => {
    expect(buildExcerpt('\nLine one\nline two.\n\nNext paragraph.')).toBe('Line one line two.');
  });

  it('cuts a long paragraph to the limit', () => {
    const excerpt = buildExcerpt('x'.repeat(EXCERPT_LIMIT + 50));
    expect(excerpt).toHaveLength(EXCERPT_LIMIT);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});
