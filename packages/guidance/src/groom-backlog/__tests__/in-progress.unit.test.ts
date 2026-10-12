import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeFakeBacklogGit } from '../../test-utils/make-fake-backlog-git.ts';
import type { BacklogGit } from '../git.ts';
import { detectInProgress } from '../in-progress.ts';

const MAIN_DATE = '2026-09-01T00:00:00Z';
const TICKET_DATE = '2026-09-02T00:00:00Z';

describe(detectInProgress, () => {
  let root: string;
  let linked: string;
  let git: BacklogGit;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'groom-in-progress-'));
    linked = mkdtempSync(path.join(tmpdir(), 'groom-in-progress-linked-'));

    // A worktree whose manifest names ticket 12, on a branch whose name names ticket 11.
    mkdirSync(path.join(linked, '.agents'));
    writeFileSync(path.join(linked, '.agents', '11-feature.branch-manifest.json'), '{"ticket_id":"12"}\n');

    git = makeFakeBacklogGit({
      // The remote branch for ticket 14 is counted against the remote's default branch, not the local one.
      commitsAhead: {
        'refs/heads/main..refs/heads/11-feature': 1,
        'refs/heads/main..refs/heads/13-thing': 2,
        'refs/remotes/origin/main..refs/remotes/origin/14-other': 2,
      },
      tips: {
        'refs/heads/11-feature': TICKET_DATE,
        'refs/heads/13-thing': TICKET_DATE,
        'refs/heads/main': MAIN_DATE,
        // Ticket 13 also has a remote-tracking branch, which the local branch outranks.
        'refs/remotes/origin/13-thing': MAIN_DATE,
        'refs/remotes/origin/14-other': TICKET_DATE,
        'refs/remotes/origin/main': MAIN_DATE,
      },
      worktrees: [
        { branchRef: 'refs/heads/main', path: root },
        { branchRef: 'refs/heads/11-feature', path: linked },
      ],
    });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(linked, { recursive: true, force: true });
  });

  it('reads the manifest, then local branches, then remote-tracking branches, with commits ahead', async () => {
    const signals = await detectInProgress({
      defaultBranch: 'main',
      git,
      numbers: new Set([11, 12, 13, 14, 15]),
      root,
    });

    expect(signals.get(12)).toMatchObject({ signal: 'manifest', ref: '11-feature', commitsAhead: 1 });
    expect(signals.get(11)).toMatchObject({ signal: 'branch', ref: '11-feature', commitsAhead: 1 });
    expect(signals.get(13)).toMatchObject({ signal: 'branch', ref: '13-thing', commitsAhead: 2 });
    expect(signals.get(14)).toMatchObject({ signal: 'remote-branch', ref: 'origin/14-other', commitsAhead: 2 });
    expect(signals.has(15)).toBe(false);
    expect(signals.get(13)?.lastCommitAt).toBe(TICKET_DATE);
  });

  it('reports only the tickets that it is asked about', async () => {
    const signals = await detectInProgress({ defaultBranch: 'main', git, numbers: new Set([14]), root });

    expect(signals.keys().toArray()).toStrictEqual([14]);
  });
});
