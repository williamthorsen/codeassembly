import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listWorkingTreeFiles } from '../list-working-tree-files.ts';

describe(listWorkingTreeFiles, () => {
  let repository: string;

  beforeEach(async () => {
    repository = await realpath(await mkdtemp(path.join(tmpdir(), 'streamline-list-')));
    execFileSync('git', ['-C', repository, 'init', '--quiet']);
  });

  afterEach(async () => {
    await rm(repository, { recursive: true, force: true });
  });

  it('lists tracked and untracked files, and drops a tracked file deleted from the working tree', async () => {
    await writeFile(path.join(repository, '.gitignore'), 'ignored.md\n', 'utf8');
    for (const file of ['deleted.md', 'kept.md']) {
      await writeFile(path.join(repository, file), `${file}\n`, 'utf8');
    }
    execFileSync('git', ['-C', repository, 'add', '--all']);
    execFileSync('git', [
      '-C',
      repository,
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      'commit',
      '--quiet',
      '--message',
      'seed',
    ]);
    await unlink(path.join(repository, 'deleted.md'));
    await writeFile(path.join(repository, 'ignored.md'), 'Ignored.\n', 'utf8');
    await writeFile(path.join(repository, 'untracked.md'), 'Untracked.\n', 'utf8');

    expect(listWorkingTreeFiles(repository).toSorted()).toStrictEqual(['.gitignore', 'kept.md', 'untracked.md']);
  });
});
