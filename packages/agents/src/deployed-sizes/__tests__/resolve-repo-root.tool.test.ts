import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveRepoRoot } from '../resolve-repo-root.ts';

const execFileAsync = promisify(execFile);

describe(resolveRepoRoot, () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await realpath(await mkdtemp(path.join(tmpdir(), 'resolve-repo-root-')));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(scratch, { recursive: true, force: true });
  });

  it('resolves the working tree root from a directory inside it', async () => {
    const root = path.join(scratch, 'repo');
    await execFileAsync('git', ['-C', scratch, 'init', '--quiet', '--initial-branch', 'main', 'repo']);

    expect(await resolveRepoRoot(root)).toBe(root);
  });

  it('resolves the working tree root from a subdirectory of it', async () => {
    const root = path.join(scratch, 'repo');
    await execFileAsync('git', ['-C', scratch, 'init', '--quiet', '--initial-branch', 'main', 'repo']);
    await mkdir(path.join(root, 'packages', 'agents'), { recursive: true });

    expect(await resolveRepoRoot(path.join(root, 'packages', 'agents'))).toBe(root);
  });

  it('answers with nothing, and no diagnostic, for a directory in no repository', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(await resolveRepoRoot(scratch)).toBeUndefined();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('answers with nothing for a directory that does not exist', async () => {
    expect(await resolveRepoRoot(path.join(scratch, 'absent'))).toBeUndefined();
  });
});
