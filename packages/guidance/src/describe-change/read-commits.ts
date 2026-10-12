import type { DescribeChangeGit, RawCommit } from './git.ts';

/**
 * Reads every commit in `base..head` through the adapter. The head defaults to `HEAD`; a pull request's head commit is
 * named instead when the checkout is not that pull request's branch.
 *
 * A head commit absent from the local repository throws `MissingCommitError`, so a caller can proceed without the
 * commits rather than fail as it does on any other git failure.
 */
export async function readCommits(input: {
  baseRef: string;
  cwd: string;
  git: DescribeChangeGit;
  headRef?: string;
}): Promise<RawCommit[]> {
  const headRef = input.headRef ?? 'HEAD';
  if (!(await input.git.hasCommit(input.cwd, headRef))) {
    throw new MissingCommitError(headRef);
  }
  return input.git.listCommits(input.cwd, input.baseRef, headRef);
}

/**
 * Thrown when the head of a range does not name a commit in the local repository, as an unfetched pull-request head
 * does.
 */
export class MissingCommitError extends Error {
  override readonly name = 'MissingCommitError';
  readonly ref: string;

  constructor(ref: string) {
    super(`${ref} does not name a commit in the local repository`);
    this.ref = ref;
  }
}
