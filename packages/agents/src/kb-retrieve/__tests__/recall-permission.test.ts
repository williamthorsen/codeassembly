import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { ScopedKb } from '../types.ts';

const { mockedStat } = vi.hoisted(() => {
  return { mockedStat: vi.fn() };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, stat: mockedStat };
});

const NOTES_VAULT = join(import.meta.dirname, 'fixtures', 'notes-vault');
const scope: ScopedKb[] = [{ name: 'notes', path: NOTES_VAULT, via: 'discovery' }];

/** Build a Node filesystem error carrying the given `code`. */
function fsError(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`mock ${code}`);
  error.code = code;
  return error;
}

describe('recallNotes permission handling', () => {
  it('skips a KB directory that is genuinely absent (ENOENT)', async () => {
    mockedStat.mockRejectedValue(fsError('ENOENT'));

    const { recallNotes } = await import('../recall.ts');
    const hits = await recallNotes({ query: 'backpressure', scopedKbs: scope });

    expect(hits).toEqual([]);
  });

  it('throws when a KB directory exists but is permission-denied (EACCES)', async () => {
    mockedStat.mockRejectedValue(fsError('EACCES'));

    const { recallNotes } = await import('../recall.ts');
    await expect(recallNotes({ query: 'backpressure', scopedKbs: scope })).rejects.toThrow(/EACCES/);
  });
});
