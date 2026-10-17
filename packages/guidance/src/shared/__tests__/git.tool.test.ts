import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { realGit } from '../git.ts';

describe('realGit', () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = realpathSync(await mkdtemp(path.join(tmpdir(), 'shared-git-')));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(scratch, { recursive: true, force: true });
  });

  describe('findCurrentBranch', () => {
    it('returns the checked-out branch name', async () => {
      git('init', '--quiet', '--initial-branch=feature/x');

      await expect(realGit.findCurrentBranch(scratch)).resolves.toBe('feature/x');
    });

    it('returns an empty string on a detached HEAD', async () => {
      git('init', '--quiet', '--initial-branch=main');
      git(
        '-c',
        'user.email=test@example.com',
        '-c',
        'user.name=Test',
        'commit',
        '--quiet',
        '--allow-empty',
        '--message',
        'seed',
      );
      git('checkout', '--quiet', '--detach');

      await expect(realGit.findCurrentBranch(scratch)).resolves.toBe('');
    });

    it('throws outside a repository', async () => {
      await expect(realGit.findCurrentBranch(scratch)).rejects.toThrow(/not a git repository/);
    });
  });

  describe('listRemotes and findRemoteUrl', () => {
    it('lists the remotes and returns a remote URL', async () => {
      git('init', '--quiet');
      git('remote', 'add', 'upstream', 'git@github.com:owner/upstream.git');
      git('remote', 'add', 'origin', 'git@github.com:owner/repo.git');

      await expect(realGit.listRemotes(scratch)).resolves.toStrictEqual(['origin', 'upstream']);
      await expect(realGit.findRemoteUrl(scratch, 'upstream')).resolves.toBe('git@github.com:owner/upstream.git');
    });

    it('returns an empty list in a repository without any remotes', async () => {
      git('init', '--quiet');

      await expect(realGit.listRemotes(scratch)).resolves.toStrictEqual([]);
    });

    it('throws for a remote that does not exist', async () => {
      git('init', '--quiet');

      await expect(realGit.findRemoteUrl(scratch, 'origin')).rejects.toThrow(/No such remote/);
    });

    it('throws outside a repository', async () => {
      await expect(realGit.listRemotes(scratch)).rejects.toThrow(/not a git repository/);
    });
  });

  describe('findTopLevel', () => {
    it('returns the root from a subdirectory', async () => {
      git('init', '--quiet');
      const subdir = path.join(scratch, 'packages', 'nested');
      await mkdir(subdir, { recursive: true });

      expect(realGit.findTopLevel(subdir)).toStrictEqual({ root: scratch });
    });

    it('quotes git outside a repository', () => {
      expect(realGit.findTopLevel(scratch)).toStrictEqual({ failure: expect.stringMatching(/^fatal:/) });
    });

    it('names the unreadable repository rather than an absent one', () => {
      git('init', '--quiet');
      // `GIT_DIR` points nowhere while `scratch` is a healthy repository, which is the shape produced by
      // a sandboxed nested `git`: The repository is present and git refuses to read it.
      vi.stubEnv('GIT_DIR', '/nonexistent/x');

      expect(realGit.findTopLevel(scratch)).toStrictEqual({
        failure: expect.stringMatching(/not a git repository: '\/nonexistent\/x'/),
      });
    });
  });

  // region | Helpers

  /** Runs git in the scratch directory. */
  function git(...args: string[]): void {
    execFileSync('git', ['-C', scratch, ...args], { stdio: 'ignore' });
  }

  // endregion | Helpers
});
