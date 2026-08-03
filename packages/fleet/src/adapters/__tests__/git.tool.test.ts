import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createGitAdapter, type GitAdapter, type GitObservation, type GitTarget, probeWorktree } from '../git.ts';

let adapter: GitAdapter | undefined;
let scratchDir: string;

/** A complete observation with every git field answered; tests override fields as needed. */
function composeObservation(overrides: Partial<GitObservation> = {}): GitObservation {
  return {
    worktreeExists: true,
    branch: 'main',
    dirtyFiles: 0,
    ahead: 0,
    behind: 0,
    baseBranch: 'origin/main',
    ...overrides,
  };
}

/** Initializes a repository with one commit on `main` in a fresh subdirectory of the scratch dir. */
function createRepo(name: string): string {
  const dir = join(scratchDir, name);
  mkdirSync(dir);
  runGitCommand(dir, 'init', '--initial-branch=main');
  commitEmpty(dir, 'one');
  return dir;
}

/** Adds an empty commit with identity supplied inline, so the test never depends on global git config. */
function commitEmpty(dir: string, message: string): void {
  execFileSync(
    'git',
    [
      '-C',
      dir,
      '-c',
      'user.name=fleet-test',
      '-c',
      'user.email=fleet@test.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--allow-empty',
      '--message',
      message,
    ],
    { stdio: 'ignore' },
  );
}

/** Runs a git command against `dir`, discarding output. */
function runGitCommand(dir: string, ...args: string[]): void {
  execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
}

/** Waits until `condition` holds, polling briefly; fails the test after the timeout. */
async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(condition()).toBe(true);
}

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), 'fleet-git-'));
});

afterEach(() => {
  adapter?.stop();
  adapter = undefined;
  rmSync(scratchDir, { recursive: true, force: true });
});

describe('probeWorktree', () => {
  it('reports a clean repository in sync with its base branch', async () => {
    const dir = createRepo('clean');
    runGitCommand(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');

    expect(await probeWorktree(dir)).toEqual(composeObservation());
  });

  it('counts working-tree changes', async () => {
    const dir = createRepo('dirty');
    runGitCommand(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    writeFileSync(join(dir, 'a.txt'), 'a');
    writeFileSync(join(dir, 'b.txt'), 'b');

    expect(await probeWorktree(dir)).toEqual(composeObservation({ dirtyFiles: 2 }));
  });

  it('reports ahead and behind against the base branch', async () => {
    const dir = createRepo('diverged');
    commitEmpty(dir, 'two');
    runGitCommand(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    runGitCommand(dir, 'reset', '--hard', 'HEAD~1');
    commitEmpty(dir, 'three');

    expect(await probeWorktree(dir)).toEqual(composeObservation({ ahead: 1, behind: 1 }));
  });

  it('resolves the base branch from origin/HEAD when it is set', async () => {
    const dir = createRepo('symbolic');
    runGitCommand(dir, 'update-ref', 'refs/remotes/origin/master', 'HEAD');
    runGitCommand(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/master');

    expect(await probeWorktree(dir)).toEqual(composeObservation({ branch: 'main', baseBranch: 'origin/master' }));
  });

  it('reports a null branch on a detached head', async () => {
    const dir = createRepo('detached');
    runGitCommand(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    runGitCommand(dir, 'checkout', '--detach');

    expect(await probeWorktree(dir)).toEqual(composeObservation({ branch: null }));
  });

  it('leaves base comparison null when no remote-tracking base exists', async () => {
    const dir = createRepo('no-origin');

    expect(await probeWorktree(dir)).toEqual(composeObservation({ ahead: null, behind: null, baseBranch: null }));
  });

  it('reports a missing worktree without probing git', async () => {
    expect(await probeWorktree(join(scratchDir, 'gone'))).toEqual({
      worktreeExists: false,
      branch: null,
      dirtyFiles: null,
      ahead: null,
      behind: null,
      baseBranch: null,
    });
  });

  it('degrades a non-repository directory to null git fields', async () => {
    const dir = join(scratchDir, 'not-a-repo');
    mkdirSync(dir);

    expect(await probeWorktree(dir)).toEqual({
      worktreeExists: true,
      branch: null,
      dirtyFiles: null,
      ahead: null,
      behind: null,
      baseBranch: null,
    });
  });
});

describe('createGitAdapter', () => {
  it('probes each target and exposes observations after the first pass', async () => {
    let changes = 0;
    adapter = createGitAdapter({
      listTargets: () => [{ laneKey: 'acme/app/101', cwd: '/work/101' }],
      onChange: () => {
        changes += 1;
      },
      pollMs: 60_000,
      probe: () => Promise.resolve(composeObservation({ dirtyFiles: 3 })),
    });

    await waitFor(() => changes > 0);

    expect(adapter.getObservations().get('acme/app/101')).toEqual(composeObservation({ dirtyFiles: 3 }));
  });

  it('drops the observation of a target that disappears', async () => {
    let changes = 0;
    let targets: GitTarget[] = [{ laneKey: 'acme/app/101', cwd: '/work/101' }];
    adapter = createGitAdapter({
      listTargets: () => targets,
      onChange: () => {
        changes += 1;
      },
      pollMs: 25,
      probe: () => Promise.resolve(composeObservation()),
    });
    await waitFor(() => changes > 0);
    expect(adapter.getObservations().has('acme/app/101')).toBe(true);

    targets = [];
    await waitFor(() => !(adapter?.getObservations().has('acme/app/101') ?? true));
  });

  it('degrades a throwing probe to an unanswered observation', async () => {
    let changes = 0;
    adapter = createGitAdapter({
      listTargets: () => [{ laneKey: 'acme/app/101', cwd: '/work/101' }],
      onChange: () => {
        changes += 1;
      },
      pollMs: 60_000,
      probe: () => Promise.reject(new Error('git exploded')),
    });

    await waitFor(() => changes > 0);

    expect(adapter.getObservations().get('acme/app/101')).toEqual({
      worktreeExists: true,
      branch: null,
      dirtyFiles: null,
      ahead: null,
      behind: null,
      baseBranch: null,
    });
  });

  it('skips ticks while a pass is still running', async () => {
    let probeCalls = 0;
    const blocked = Promise.withResolvers<GitObservation>();
    adapter = createGitAdapter({
      listTargets: () => [{ laneKey: 'acme/app/101', cwd: '/work/101' }],
      onChange: () => {},
      pollMs: 10,
      probe: () => {
        probeCalls += 1;
        return blocked.promise;
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(probeCalls).toBe(1);
    blocked.resolve(composeObservation());
  });
});
