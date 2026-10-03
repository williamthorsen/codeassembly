import { mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCommand } from '../fetch.ts';
import { detectInProgress } from '../in-progress.ts';
import { git, makeGitFixture } from '../test-utils/make-git-fixture.ts';

describe(detectInProgress, () => {
  let root: string;
  let linked: string;

  beforeEach(() => {
    root = makeGitFixture('groom-in-progress-');
    linked = `${root}-linked`;

    // A worktree whose manifest names ticket 12, on a branch whose name names ticket 11.
    git(root, 'worktree', 'add', '--quiet', '-b', '11-feature', linked);
    git(linked, 'commit', '--quiet', '--allow-empty', '--message', 'Work');
    mkdirSync(path.join(linked, '.agents'));
    writeFileSync(path.join(linked, '.agents', '11-feature.branch-manifest.json'), '{"ticket_id":"12"}\n');

    // A local branch for ticket 13, two commits ahead.
    git(root, 'branch', '13-thing');
    git(root, 'checkout', '--quiet', '13-thing');
    git(root, 'commit', '--quiet', '--allow-empty', '--message', 'One');
    git(root, 'commit', '--quiet', '--allow-empty', '--message', 'Two');
    git(root, 'checkout', '--quiet', 'main');

    // Remote-tracking branches for ticket 14 and for ticket 13, which the local branch outranks.
    git(root, 'update-ref', 'refs/remotes/origin/main', 'main');
    git(root, 'update-ref', 'refs/remotes/origin/14-other', '13-thing');
    git(root, 'update-ref', 'refs/remotes/origin/13-thing', 'main');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(linked, { recursive: true, force: true });
  });

  it('reads the manifest, then local branches, then remote-tracking branches, with commits ahead', async () => {
    const signals = await detectInProgress({
      defaultBranch: 'main',
      numbers: new Set([11, 12, 13, 14, 15]),
      root,
      run: runCommand,
    });

    expect(signals.get(12)).toMatchObject({ signal: 'manifest', ref: '11-feature', commitsAhead: 1 });
    expect(signals.get(11)).toMatchObject({ signal: 'branch', ref: '11-feature', commitsAhead: 1 });
    expect(signals.get(13)).toMatchObject({ signal: 'branch', ref: '13-thing', commitsAhead: 2 });
    expect(signals.get(14)).toMatchObject({ signal: 'remote-branch', ref: 'origin/14-other', commitsAhead: 2 });
    expect(signals.has(15)).toBe(false);
    expect(Date.parse(signals.get(13)?.lastCommitAt ?? '')).not.toBeNaN();
  });

  it('reports only the tickets that it is asked about', async () => {
    const signals = await detectInProgress({ defaultBranch: 'main', numbers: new Set([14]), root, run: runCommand });

    expect(signals.keys().toArray()).toStrictEqual([14]);
  });
});
