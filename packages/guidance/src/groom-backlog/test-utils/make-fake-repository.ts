import path from 'node:path';

import { makeFakeBacklogGit } from '../../test-utils/make-fake-backlog-git.ts';
import type { BacklogGit } from '../git.ts';

/** Builds a git adapter answering for a repository at `root` on `main`, with ticket 10's branch three commits ahead. */
export function makeFakeRepository(root: string): BacklogGit {
  return makeFakeBacklogGit({
    commitsAhead: { 'refs/heads/main..refs/heads/10-uploader': 3 },
    commonDir: path.join(root, '.git'),
    originHead: 'main',
    shortSha: 'abc1234',
    tips: { 'refs/heads/main': '2026-09-01T00:00:00Z', 'refs/heads/10-uploader': '2026-09-02T00:00:00Z' },
    worktrees: [{ branchRef: 'refs/heads/main', path: root }],
  });
}
