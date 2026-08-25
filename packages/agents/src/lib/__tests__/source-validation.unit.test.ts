import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { describeSourceNameProblem, findSourceProblem } from '../source-validation.ts';

// Root bypasses the permission bits the unreadable case depends on.
const canEnforceDirPermissions = process.getuid !== undefined && process.getuid() !== 0;

describe(describeSourceNameProblem, () => {
  it.each(['org-guidance', '@williamthorsen/nmr', 'a.b_c-1'])('accepts %s', (name) => {
    expect(describeSourceNameProblem(name)).toBeUndefined();
  });

  it.each([
    { name: '', reason: /empty/ },
    { name: '..', reason: /relative path segment/ },
    { name: '../escape', reason: /relative path segment/ },
    { name: 'org/../escape', reason: /relative path segment/ },
    { name: '.', reason: /relative path segment/ },
    { name: '/absolute', reason: /absolute path/ },
    { name: 'org//nested', reason: /empty path segment/ },
    { name: 'org/', reason: /empty path segment/ },
    { name: String.raw`org\win`, reason: /path separator or control character/ },
  ])('rejects $name', ({ name, reason }) => {
    expect(describeSourceNameProblem(name)).toMatch(reason);
  });
});

describe(findSourceProblem, () => {
  let root: string;

  beforeEach(async () => {
    root = path.join(tmpdir(), `agents-test-source-problem-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('accepts a readable directory', async () => {
    expect(await findSourceProblem(root)).toBeUndefined();
  });

  it('classifies an absent path as missing', async () => {
    expect(await findSourceProblem(path.join(root, 'absent'))).toEqual({ kind: 'missing', detail: 'does not exist' });
  });

  it('classifies a regular file as not a directory', async () => {
    const filePath = path.join(root, 'a-file');
    await writeFile(filePath, 'not a dir\n', 'utf8');

    expect(await findSourceProblem(filePath)).toEqual({ kind: 'not-a-directory', detail: 'not a directory' });
  });

  // A path through a file can never be populated, so it belongs with the failures rather than the not-yet states.
  it('classifies a path traversing a regular file as not a directory', async () => {
    await writeFile(path.join(root, 'notes.md'), 'notes\n', 'utf8');

    expect(await findSourceProblem(path.join(root, 'notes.md', 'guidance'))).toEqual({
      kind: 'not-a-directory',
      detail: 'not a directory',
    });
  });

  it.runIf(canEnforceDirPermissions)('classifies a directory it cannot traverse as unreadable', async () => {
    const dir = path.join(root, 'locked');
    await mkdir(dir);
    await chmod(dir, 0o000);

    try {
      expect(await findSourceProblem(dir)).toMatchObject({ kind: 'unreadable' });
    } finally {
      await chmod(dir, 0o755);
    }
  });
});
