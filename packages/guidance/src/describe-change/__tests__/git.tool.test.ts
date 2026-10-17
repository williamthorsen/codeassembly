import { execFile } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { realGit } from '../git.ts';

/**
 * Config for every commit that the test makes: an identity, and no automatic maintenance, whose background run can
 * outlive the test's directory.
 */
const COMMIT_CONFIG = [
  '-c',
  'maintenance.auto=false',
  '-c',
  'gc.auto=0',
  '-c',
  'user.email=test@example.com',
  '-c',
  'user.name=Test',
];

const execFileAsync = promisify(execFile);

describe('realGit', () => {
  let repository: string;

  beforeEach(async () => {
    repository = await realpath(await mkdtemp(join(tmpdir(), 'describe-change-git-')));
    await git('init', '--quiet');
    await writeFile(join(repository, 'seed.txt'), 'seed\n', 'utf8');
    await commitAll('seed');
    await git('tag', 'base');
  });

  afterEach(async () => {
    await rm(repository, { recursive: true, force: true });
  });

  describe('hasCommit', () => {
    it('reports a ref that names a commit', async () => {
      expect(await realGit.hasCommit(repository, 'base')).toBe(true);
    });

    it('reports a commit absent from the repository as absent', async () => {
      expect(await realGit.hasCommit(repository, '0123456789abcdef0123456789abcdef01234567')).toBe(false);
    });

    it('if the directory is not a repository, throws a git failure', async () => {
      const outside = await mkdtemp(join(tmpdir(), 'describe-change-git-outside-'));
      try {
        await expect(realGit.hasCommit(outside, 'HEAD')).rejects.toThrow(/not a git repository/);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });

  describe('listCommits', () => {
    it('reads a subject containing the delimiters used by the commit template itself', async () => {
      await commitMessages(['agents|feat: Add a parser: the reader, the writer, and the verifier']);

      const commits = await realGit.listCommits(repository, 'base', 'HEAD');

      expect(commits).toHaveLength(1);
      expect(commits[0]?.subject).toBe('agents|feat: Add a parser: the reader, the writer, and the verifier');
      expect(commits[0]?.trailers).toStrictEqual([]);
    });

    it('reads a commit’s Change trailers, and reports none for a commit containing none', async () => {
      await commitMessages([
        'agents|refactor: Extract the reader',
        [
          'agents|fix: Squash the branch',
          '',
          'Change: agents|feat: Add the parser',
          'Change: agents|fix: Correct the guard',
        ].join('\n'),
      ]);

      const commits = await realGit.listCommits(repository, 'base', 'HEAD');
      const bySubject = new Map(commits.map((commit) => [commit.subject, commit.trailers]));

      expect(bySubject.get('agents|fix: Squash the branch')).toStrictEqual([
        'agents|feat: Add the parser',
        'agents|fix: Correct the guard',
      ]);
      expect(bySubject.get('agents|refactor: Extract the reader')).toStrictEqual([]);
    });

    it('reads a body whose trailer block follows several paragraphs', async () => {
      await commitMessages([
        [
          'agents|fix: Squash the branch',
          '',
          'A first paragraph reporting what the branch did.',
          '',
          'A second paragraph, so the trailer block is not the body’s only one.',
          '',
          'Change: agents|feat: Add the parser',
        ].join('\n'),
      ]);

      const commits = await realGit.listCommits(repository, 'base', 'HEAD');

      expect(commits[0]?.trailers).toStrictEqual(['agents|feat: Add the parser']);
    });

    it('yields nothing for a range without commits', async () => {
      expect(await realGit.listCommits(repository, 'base', 'HEAD')).toStrictEqual([]);
    });

    it('reports commits oldest first, matching the order in which trailers are read', async () => {
      await commitMessages([
        'agents|feat: Add the parser',
        [
          'agents|fix: Squash the branch',
          '',
          'Change: agents|refactor: Extract the reader',
          'Change: agents|docs: Note it',
        ].join('\n'),
        'agents|fix: Correct the guard',
      ]);

      const commits = await realGit.listCommits(repository, 'base', 'HEAD');

      expect(commits.map((commit) => commit.subject)).toStrictEqual([
        'agents|feat: Add the parser',
        'agents|fix: Squash the branch',
        'agents|fix: Correct the guard',
      ]);
      expect(commits[1]?.trailers).toStrictEqual(['agents|refactor: Extract the reader', 'agents|docs: Note it']);
    });

    it('contributes nothing for a merge commit', async () => {
      await commitMessages(['agents|feat: Add the parser']);
      await git('checkout', '--quiet', '-b', 'side', 'base');
      await writeFile(join(repository, 'side.txt'), 'side\n', 'utf8');
      await commitAll('agents|fix: Correct the guard');
      await git('checkout', '--quiet', '-');
      await git(...COMMIT_CONFIG, 'merge', '--no-ff', '--no-gpg-sign', '--quiet', '-m', 'Merge side', 'side');

      const commits = await realGit.listCommits(repository, 'base', 'HEAD');

      // Two branches committed in the same second do not have a stable order between them, so this fixes membership
      // alone; the linear-history case above fixes the order.
      expect(commits.map((commit) => commit.subject).toSorted()).toStrictEqual([
        'agents|feat: Add the parser',
        'agents|fix: Correct the guard',
      ]);
    });

    it('reads the range to an explicit head commit that the checkout is not on', async () => {
      await commitMessages(['agents|feat: Add the parser']);
      await git('checkout', '--quiet', '-b', 'side', 'base');
      await writeFile(join(repository, 'side.txt'), 'side\n', 'utf8');
      await commitAll('kb|fix: Correct the store');
      const { stdout } = await git('rev-parse', 'side');
      await git('checkout', '--quiet', '-');

      const commits = await realGit.listCommits(repository, 'base', stdout.trim());

      expect(commits.map((commit) => commit.subject)).toStrictEqual(['kb|fix: Correct the store']);
    });

    it('if the directory is not a repository, throws a git failure', async () => {
      const outside = await mkdtemp(join(tmpdir(), 'describe-change-git-outside-'));
      try {
        await expect(realGit.listCommits(outside, 'base', 'HEAD')).rejects.toThrow(/not a git repository/);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });

  /** Stages everything in the repository and commits it under `message`. */
  async function commitAll(message: string): Promise<void> {
    await git('add', '--all');
    await git(...COMMIT_CONFIG, 'commit', '--message', message, '--no-gpg-sign', '--no-verify', '--quiet');
  }

  /** Commits one new file per message, in order. */
  async function commitMessages(messages: readonly string[]): Promise<void> {
    for (const [index, message] of messages.entries()) {
      await writeFile(join(repository, `file${index}.txt`), `${index}\n`, 'utf8');
      await commitAll(message);
    }
  }

  /** Runs git in the repository. */
  async function git(...args: string[]): Promise<{ stdout: string }> {
    return execFileAsync('git', ['-C', repository, ...args]);
  }
});
