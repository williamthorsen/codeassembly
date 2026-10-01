import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockedExistsSync } = vi.hoisted(() => {
  return { mockedExistsSync: vi.fn() };
});

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return {
    ...original,
    default: { ...original, existsSync: mockedExistsSync },
    existsSync: mockedExistsSync,
  };
});

/** The directory containing the resolver module, from which both candidates are resolved. */
const RESOLVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PRIMARY = path.resolve(RESOLVER_DIR, '../../content');
const FALLBACK = path.resolve(RESOLVER_DIR, '../../../content');

describe('resolveContentDir', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the primary candidate when it exists', async () => {
    mockedExistsSync.mockImplementation((candidate: string) => candidate === PRIMARY || candidate === FALLBACK);

    const { resolveContentDir } = await import('../content-resolver.ts');

    expect(resolveContentDir()).toBe(PRIMARY);
  });

  it('returns the fallback candidate when only it exists', async () => {
    mockedExistsSync.mockImplementation((candidate: string) => candidate === FALLBACK);

    const { resolveContentDir } = await import('../content-resolver.ts');

    expect(resolveContentDir()).toBe(FALLBACK);
  });
});
