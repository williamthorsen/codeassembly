import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeTempDir } from '../../test-utils/scaffolding.ts';
import { pathExists } from '../exists.ts';
import { writeAtomic } from '../write-atomic.ts';

// Mock the write path with a passthrough to the real implementations, so most calls hit disk normally; the
// failure-cleanup tests override `rename` and `unlink` per-call.
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    rename: vi.fn(actual.rename),
    unlink: vi.fn(actual.unlink),
    writeFile: vi.fn(actual.writeFile),
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe(writeAtomic, () => {
  it('writes the content to the target path', async () => {
    const path = join(await makeTempDir('kb-write-atomic-'), 'target.txt');

    await writeAtomic(path, 'the content\n');

    expect(await readFile(path, 'utf8')).toBe('the content\n');
  });

  it('stages the temp file beside the target, keeping the rename within one filesystem', async () => {
    const path = join(await makeTempDir('kb-write-atomic-'), 'target.txt');

    await writeAtomic(path, 'the content\n');

    expect(dirname(readStagedTempPath())).toBe(dirname(path));
  });

  it('removes the temp file and rethrows when the rename fails', async () => {
    const path = join(await makeTempDir('kb-write-atomic-'), 'target.txt');
    const renameError = new Error('EXDEV: cross-device link not permitted');
    vi.mocked(rename).mockRejectedValueOnce(renameError);

    await expect(writeAtomic(path, 'the content\n')).rejects.toBe(renameError);

    expect(await pathExists(readStagedTempPath())).toBe(false);
    expect(await pathExists(path)).toBe(false);
  });

  it('surfaces the rename error when the cleanup also fails', async () => {
    const path = join(await makeTempDir('kb-write-atomic-'), 'target.txt');
    const renameError = new Error('EXDEV: cross-device link not permitted');
    vi.mocked(rename).mockRejectedValueOnce(renameError);
    vi.mocked(unlink).mockRejectedValueOnce(new Error('EACCES: permission denied'));

    await expect(writeAtomic(path, 'the content\n')).rejects.toBe(renameError);

    // Without this the test would pass on an inert `unlink` mock, never having exercised a failing cleanup.
    expect(unlink).toHaveBeenCalledWith(readStagedTempPath());
  });
});

// region | Helpers

/** Returns the path the mocked `writeFile` was called with, which is the temp file `writeAtomic` staged. */
function readStagedTempPath(): string {
  const call = vi.mocked(writeFile).mock.calls[0];
  if (call === undefined) {
    throw new Error('writeFile was not called');
  }
  return String(call[0]);
}

// endregion | Helpers
