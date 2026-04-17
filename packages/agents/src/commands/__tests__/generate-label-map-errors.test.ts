import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockedReaddir, mockedStat } = vi.hoisted(() => {
  return { mockedReaddir: vi.fn(), mockedStat: vi.fn() };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...original,
    readdir: mockedReaddir.mockImplementation(original.readdir),
    stat: mockedStat.mockImplementation(original.stat),
  };
});

describe('generateLabelMap error paths', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `agents-test-errors-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    mockedReaddir.mockRestore();
    mockedStat.mockRestore();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('propagates non-ENOENT errors from readdir in scope derivation', async () => {
    const eaccesError = Object.assign(new Error('permission denied'), { code: 'EACCES' });

    // Create packages/ so readdir is called on it.
    await mkdir(path.join(tempDir, 'packages'), { recursive: true });

    mockedReaddir.mockRejectedValueOnce(eaccesError);

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { generateLabelMap } = await import('../generate-label-map.js');

    await expect(generateLabelMap({ force: false }, tempDir)).rejects.toThrow('permission denied');

    infoSpy.mockRestore();
  });

  it('propagates non-ENOENT errors from stat in overwrite guard', async () => {
    const eaccesError = Object.assign(new Error('permission denied'), { code: 'EACCES' });

    mockedStat.mockRejectedValueOnce(eaccesError);

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const { generateLabelMap } = await import('../generate-label-map.js');

    await expect(generateLabelMap({ force: false }, tempDir)).rejects.toThrow('permission denied');

    infoSpy.mockRestore();
  });
});
