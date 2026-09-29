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

describe('resolveContentDir error path', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw when the filesystem does not contain any candidate content directory', async () => {
    mockedExistsSync.mockReturnValue(false);

    const { resolveContentDir } = await import('../content-resolver.ts');
    expect(() => resolveContentDir()).toThrow('Could not locate content directory');
  });
});
