import { mkdtempSync, realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { realGit } from '../git.ts';
import { git, makeGitFixture } from '../test-utils/make-git-fixture.ts';

describe('realGit', () => {
  let root: string;
  let linked: string;

  beforeEach(() => {
    root = makeGitFixture('groom-git-');
    linked = `${root}-linked`;
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(linked, { recursive: true, force: true });
  });

  describe('findCommonDir', () => {
    it("returns the primary worktree's git directory from the primary worktree and from a linked one", async () => {
      git(root, 'worktree', 'add', '--quiet', '-b', '15-linked', linked);
      const expected = path.join(root, '.git');

      expect(await realGit.findCommonDir(root)).toBe(expected);
      expect(await realGit.findCommonDir(linked)).toBe(expected);
    });
  });

  describe('findShortSha', () => {
    it('returns the short SHA of HEAD', async () => {
      expect(await realGit.findShortSha(root)).toBe(git(root, 'rev-parse', '--short', 'HEAD'));
    });
  });

  describe('findOriginHead', () => {
    it('returns the branch to which origin/HEAD points, without its prefix', async () => {
      git(root, 'update-ref', 'refs/remotes/origin/trunk', 'main');
      git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');

      expect(await realGit.findOriginHead(root)).toBe('trunk');
    });

    it('returns undefined when the remote does not record one', async () => {
      expect(await realGit.findOriginHead(root)).toBeUndefined();
    });
  });

  describe('hasRef', () => {
    it('reports an existing ref as present and a missing one as absent', async () => {
      git(root, 'update-ref', 'refs/remotes/origin/main', 'main');

      expect(await realGit.hasRef(root, 'refs/remotes/origin/main')).toBe(true);
      expect(await realGit.hasRef(root, 'refs/remotes/origin/missing')).toBe(false);
    });
  });

  describe('listBranchTips', () => {
    it('lists local and remote-tracking branches with ISO committer dates', async () => {
      git(root, 'branch', '13-thing');
      git(root, 'update-ref', 'refs/remotes/origin/14-other', 'main');

      const tips = await realGit.listBranchTips(root);

      expect([...tips.keys()].toSorted()).toStrictEqual([
        'refs/heads/13-thing',
        'refs/heads/main',
        'refs/remotes/origin/14-other',
      ]);
      expect(Date.parse(tips.get('refs/heads/main') ?? '')).not.toBeNaN();
    });
  });

  describe('countCommitsAhead', () => {
    it('counts the commits on a ref that its base lacks', async () => {
      git(root, 'checkout', '--quiet', '-b', '13-thing');
      git(root, 'commit', '--quiet', '--allow-empty', '--message', 'One');
      git(root, 'commit', '--quiet', '--allow-empty', '--message', 'Two');

      expect(await realGit.countCommitsAhead(root, 'refs/heads/main', 'refs/heads/13-thing')).toBe(2);
    });
  });

  describe('listCommitsSince', () => {
    it('lists the commits on a ref, newest first, keeping a subject with a reference and colons whole', async () => {
      git(root, 'commit', '--quiet', '--allow-empty', '--message', '#12 guidance|fix: Repair the reader: twice');

      const commits = await realGit.listCommitsSince(root, 'main', '2000-01-01T00:00:00Z');

      expect(commits.map((commit) => commit.subject)).toStrictEqual([
        '#12 guidance|fix: Repair the reader: twice',
        'Initial commit',
      ]);
      expect(commits[0]).toMatchObject({ sha: git(root, 'rev-parse', '--short', 'HEAD') });
      expect(Date.parse(commits[0]?.date ?? '')).not.toBeNaN();
    });

    it('omits commits made before the date', async () => {
      expect(
        await realGit.listCommitsSince(root, 'main', new Date(Date.now() + 86_400_000).toISOString()),
      ).toStrictEqual([]);
    });
  });

  describe('listWorktrees', () => {
    it('lists each worktree with its full branch ref, and a detached one without a branch', async () => {
      git(root, 'worktree', 'add', '--quiet', '-b', '11-feature', linked);
      const detached = realpathSync(mkdtempSync(path.join(tmpdir(), 'groom-git-detached-')));
      await rm(detached, { recursive: true, force: true });
      git(root, 'worktree', 'add', '--quiet', '--detach', detached);
      try {
        const worktrees = await realGit.listWorktrees(root);

        // Git orders linked worktrees by path, and the temporary paths are random.
        expect(worktrees[0]).toStrictEqual({ branchRef: 'refs/heads/main', path: root });
        expect(worktrees.slice(1)).toHaveLength(2);
        expect(worktrees).toContainEqual({ branchRef: 'refs/heads/11-feature', path: linked });
        expect(worktrees).toContainEqual({ branchRef: undefined, path: detached });
      } finally {
        await rm(detached, { recursive: true, force: true });
      }
    });
  });
});
