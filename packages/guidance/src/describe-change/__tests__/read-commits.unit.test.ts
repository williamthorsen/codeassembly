import { describe, expect, it } from 'vitest';

import { MissingCommitError, readCommits } from '../read-commits.ts';
import { makeFakeGit, makeRawCommit } from '../test-utils/make-fake-git.ts';

describe(readCommits, () => {
  it('reads the range to HEAD when the input does not name a head', async () => {
    const commits = [makeRawCommit('agents|feat: Add the parser', 0)];
    const git = makeFakeGit({ commits });

    expect(await readCommits({ baseRef: 'base', cwd: '/repo', git })).toStrictEqual(commits);
    expect(git.listedHeads).toStrictEqual(['HEAD']);
  });

  it('reads the range to an explicit head', async () => {
    const git = makeFakeGit({ knownRefs: ['abc123'] });

    await readCommits({ baseRef: 'base', cwd: '/repo', git, headRef: 'abc123' });

    expect(git.listedHeads).toStrictEqual(['abc123']);
  });

  it('if the head commit is absent from the repository, throws MissingCommitError naming it', async () => {
    const git = makeFakeGit({ knownRefs: [] });

    await expect(readCommits({ baseRef: 'base', cwd: '/repo', git, headRef: 'abc123' })).rejects.toThrow(
      expect.objectContaining({ name: 'MissingCommitError', ref: 'abc123' }),
    );
    expect(git.listedHeads).toStrictEqual([]);
  });

  it('propagates any other git failure rather than reporting a missing commit', async () => {
    const git = { ...makeFakeGit(), hasCommit: () => Promise.reject(new Error('fatal: not a git repository')) };

    const reading = readCommits({ baseRef: 'base', cwd: '/repo', git });

    await expect(reading).rejects.toThrow(/not a git repository/);
    await expect(reading).rejects.not.toBeInstanceOf(MissingCommitError);
  });
});
