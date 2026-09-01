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
    vi.unstubAllEnvs();
    await rm(scratch, { recursive: true, force: true });
  });

  it('returns an explicit cwd override verbatim without invoking git', () => {
    // `scratch` is not a git repository, so a returned value equal to it proves the override short-circuited
    // ahead of the git-root lookup rather than falling through to it.
    expect(resolveProjectRoot({ cwd: '/explicit/override', startDir: scratch })).toBe('/explicit/override');
  });

  it('treats an empty cwd override as unset and falls through to the git root', () => {
    execFileSync('git', ['-C', scratch, 'init', '--quiet']);

    // The `--cwd=` flag form yields an empty string; it must not anchor at `''` but fall through to
    // the git-root lookup, matching the no-override behavior.
    expect(resolveProjectRoot({ cwd: '', startDir: scratch })).toBe(realpathSync(scratch));
  });

  it('resolves the git repo root when invoked from a subdirectory', async () => {
    execFileSync('git', ['-C', scratch, 'init', '--quiet']);
    const subdir = path.join(scratch, 'packages', 'nested');
    await mkdir(subdir, { recursive: true });

    // `git rev-parse --show-toplevel` returns the realpath, which on macOS resolves `/var` to `/private/var`.
    expect(resolveProjectRoot({ startDir: subdir })).toBe(realpathSync(scratch));
  });

  it('falls back to the start directory and quotes git when the root cannot be resolved', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    expect(resolveProjectRoot({ startDir: scratch })).toBe(scratch);
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/git could not resolve the repository root/));
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/fatal:/));
  });

  it('names the unreadable repository rather than an absent one', () => {
    execFileSync('git', ['-C', scratch, 'init', '--quiet']);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    // `GIT_DIR` points nowhere while `scratch` is a healthy repository, which is the shape a sandboxed
    // nested `git` produces: the repository is present and git refuses to read it.
    vi.stubEnv('GIT_DIR', '/nonexistent/x');

    expect(resolveProjectRoot({ startDir: scratch })).toBe(scratch);
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/not a git repository: '\/nonexistent\/x'/));
  });
});
