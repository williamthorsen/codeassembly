import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { directoryExists, pathExists } from '../exists.ts';

let dir: string;
let filePath: string;
let subdirPath: string;
let missingPath: string;
// A path whose parent segment is a regular file — statting it yields ENOTDIR.
let throughFilePath: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kb-core-exists-'));
  filePath = join(dir, 'file.txt');
  subdirPath = join(dir, 'subdir');
  missingPath = join(dir, 'absent');
  throughFilePath = join(filePath, 'child');
  await writeFile(filePath, 'contents', 'utf8');
  await mkdir(subdirPath);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe(pathExists, () => {
  it('returns true for an existing file', async () => {
    expect(await pathExists(filePath)).toBe(true);
  });

  it('returns true for an existing directory', async () => {
    expect(await pathExists(subdirPath)).toBe(true);
  });

  it('returns false for a missing path', async () => {
    expect(await pathExists(missingPath)).toBe(false);
  });

  it('re-throws a non-absent error code by default', async () => {
    await expect(pathExists(throughFilePath)).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  it('returns false when the error code is listed in absentCodes', async () => {
    expect(await pathExists(throughFilePath, { absentCodes: ['ENOENT', 'ENOTDIR'] })).toBe(false);
  });

  it('returns false for any error when treatErrorsAsAbsent is set', async () => {
    expect(await pathExists(throughFilePath, { treatErrorsAsAbsent: true })).toBe(false);
  });
});

describe(directoryExists, () => {
  it('returns true for an existing directory', async () => {
    expect(await directoryExists(subdirPath)).toBe(true);
  });

  it('returns false for an existing file that is not a directory', async () => {
    expect(await directoryExists(filePath)).toBe(false);
  });

  it('returns false for a missing path', async () => {
    expect(await directoryExists(missingPath)).toBe(false);
  });

  it('re-throws a non-absent error code by default', async () => {
    await expect(directoryExists(throughFilePath)).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  it('returns false for any error when treatErrorsAsAbsent is set', async () => {
    expect(await directoryExists(throughFilePath, { treatErrorsAsAbsent: true })).toBe(false);
  });
});
