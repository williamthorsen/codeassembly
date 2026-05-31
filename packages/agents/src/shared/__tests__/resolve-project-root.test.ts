import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveProjectRoot } from '../resolve-project-root.ts';

describe(resolveProjectRoot, () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'resolve-project-root-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(scratch, { recursive: true, force: true });
  });

  it('returns an explicit cwd override verbatim without invoking git', () => {
    // `scratch` is not a git repository, so a returned value equal to it proves the override short-circuited
    // ahead of the git-root lookup rather than falling through to it.
    expect(resolveProjectRoot({ cwd: '/explicit/override', startDir: scratch })).toBe('/explicit/override');
  });

  it('resolves the git repo root when invoked from a subdirectory', async () => {
    execFileSync('git', ['-C', scratch, 'init', '--quiet']);
    const subdir = path.join(scratch, 'packages', 'nested');
    await mkdir(subdir, { recursive: true });

    // `git rev-parse --show-toplevel` returns the realpath, which on macOS resolves `/var` to `/private/var`.
    expect(resolveProjectRoot({ startDir: subdir })).toBe(realpathSync(scratch));
  });

  it('falls back to the start directory and warns when not inside a git repository', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    expect(resolveProjectRoot({ startDir: scratch })).toBe(scratch);
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/not inside a git repository/));
  });
});
