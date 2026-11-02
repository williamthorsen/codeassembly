import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { ScopedKb } from '../types.ts';

const { mockedDirectoryExists } = vi.hoisted(() => {
  return { mockedDirectoryExists: vi.fn() };
});

// `directoryExists` returns false for an absent directory and rethrows any other stat error.
vi.mock('@williamthorsen/kb/filesystem', async (importOriginal) => {
  const original = await importOriginal<typeof import('@williamthorsen/kb/filesystem')>();
  return { ...original, directoryExists: mockedDirectoryExists };
});

const NOTES_VAULT = join(import.meta.dirname, 'fixtures', 'notes-vault');
const scope: ScopedKb[] = [{ name: 'notes', path: NOTES_VAULT, via: 'discovery' }];

describe('recallNotes permission handling', () => {
  it('skips a KB directory that is genuinely absent (ENOENT)', async () => {
    mockedDirectoryExists.mockResolvedValue(false);

    const { recallNotes } = await import('../recall.ts');
    const { hits, missingKbs } = await recallNotes({ query: 'backpressure', scopedKbs: scope });

    expect(hits).toEqual([]);
    expect(missingKbs).toEqual(scope);
  });

  it('throws when a KB directory exists but is permission-denied (EACCES)', async () => {
    mockedDirectoryExists.mockRejectedValue(fsError('EACCES'));

    const { recallNotes } = await import('../recall.ts');
    await expect(recallNotes({ query: 'backpressure', scopedKbs: scope })).rejects.toThrow(/EACCES/);
  });
});

/** Builds a Node filesystem error with the given `code`. */
function fsError(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`mock ${code}`);
  error.code = code;
  return error;
}
