import { describe, expect, it } from 'vitest';

import { type GhResult, mergePullRequest, type MergeRequest } from '../merge.ts';

const MERGED_VIEW = {
  state: 'MERGED',
  mergeCommit: { oid: 'abc123' },
  url: 'https://github.com/acme/widgets/pull/42',
  mergedAt: '2026-09-28T22:00:00Z',
  headRefName: 'feature/cache',
  headRepository: { name: 'widgets' },
  headRepositoryOwner: { login: 'acme' },
};

const SQUASH_REQUEST: MergeRequest = {
  bodyPath: '/tmp/body.md',
  deletionStrategy: 'remote',
  prNumber: 42,
  strategy: 'squash',
  title: 'agents|feat: Add cache',
};

describe(mergePullRequest, () => {
  describe('merge arguments', () => {
    it('passes the subject, body file, and no deletion flag for a squash with remote deletion', async () => {
      const gh = makeFakeGh();

      await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(gh.calls[0]).toEqual([
        'pr',
        'merge',
        '42',
        '--squash',
        '--subject',
        'agents|feat: Add cache',
        '--body-file',
        '/tmp/body.md',
      ]);
    });

    it('omits the subject for a merge commit and adds --delete-branch for both', async () => {
      const gh = makeFakeGh();

      await mergePullRequest({ ...SQUASH_REQUEST, deletionStrategy: 'both', strategy: 'merge' }, gh.run);

      expect(gh.calls[0]).toEqual(['pr', 'merge', '42', '--merge', '--body-file', '/tmp/body.md', '--delete-branch']);
    });

    it('omits the subject and body file for a rebase', async () => {
      const gh = makeFakeGh();

      await mergePullRequest({ ...SQUASH_REQUEST, deletionStrategy: 'none', strategy: 'rebase' }, gh.run);

      expect(gh.calls[0]).toEqual(['pr', 'merge', '42', '--rebase']);
    });
  });

  it('returns the merge failure with gh stderr and exit code, and runs nothing after it', async () => {
    const gh = makeFakeGh({ merge: { exitCode: 1, stderr: 'GraphQL: Pull request is not mergeable\n', stdout: '' } });

    const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

    expect(outcome).toEqual({ ok: false, exitCode: 1, stderr: 'GraphQL: Pull request is not mergeable\n' });
    expect(gh.calls).toHaveLength(1);
  });

  it('fails without deleting when the PR is not MERGED after gh reports success', async () => {
    const gh = makeFakeGh({ view: ok(JSON.stringify({ ...MERGED_VIEW, state: 'OPEN', mergeCommit: null })) });

    const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

    expect(outcome).toEqual({ ok: false, exitCode: 1, stderr: 'PR #42 is OPEN after merge; branch not deleted.\n' });
    expect(gh.calls.some((args) => args[0] === 'api')).toBe(false);
  });

  it('fails without deleting when the post-merge view cannot be parsed', async () => {
    const gh = makeFakeGh({ view: ok('not json') });

    const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

    expect(outcome.ok).toBe(false);
    expect(gh.calls.some((args) => args[0] === 'api')).toBe(false);
  });

  describe('branch deletion', () => {
    it('deletes the head ref on the head repo and reports the merge result', async () => {
      const gh = makeFakeGh();

      const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(gh.calls[2]).toEqual(['api', '-X', 'DELETE', 'repos/acme/widgets/git/refs/heads/feature/cache']);
      expect(outcome).toEqual({
        ok: true,
        result: {
          branchDeletion: 'deleted',
          headRefName: 'feature/cache',
          mergeCommit: { oid: 'abc123' },
          mergedAt: '2026-09-28T22:00:00Z',
          url: 'https://github.com/acme/widgets/pull/42',
        },
        warnings: [],
      });
    });

    it('targets the fork for a cross-repo PR', async () => {
      const view = { ...MERGED_VIEW, headRepository: { name: 'widgets-fork' }, headRepositoryOwner: { login: 'dana' } };
      const gh = makeFakeGh({ view: ok(JSON.stringify(view)) });

      await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(gh.calls[2]).toEqual(['api', '-X', 'DELETE', 'repos/dana/widgets-fork/git/refs/heads/feature/cache']);
    });

    it('reports a ref that no longer exists as already deleted', async () => {
      const gh = makeFakeGh({ api: fail('gh: Reference does not exist (HTTP 422)\n') });

      const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(outcome).toMatchObject({ ok: true, result: { branchDeletion: 'already-deleted' }, warnings: [] });
    });

    it('reports a deleted fork as already deleted without calling the API', async () => {
      const view = { ...MERGED_VIEW, headRepository: null, headRepositoryOwner: null };
      const gh = makeFakeGh({ view: ok(JSON.stringify(view)) });

      const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(outcome).toMatchObject({ ok: true, result: { branchDeletion: 'already-deleted' } });
      expect(gh.calls.some((args) => args[0] === 'api')).toBe(false);
    });

    it('warns on any other deletion failure and still reports the merge as successful', async () => {
      const gh = makeFakeGh({ api: fail('gh: Resource not accessible by integration (HTTP 403)\n') });

      const outcome = await mergePullRequest(SQUASH_REQUEST, gh.run);

      expect(outcome).toMatchObject({
        ok: true,
        result: { branchDeletion: 'failed', mergeCommit: { oid: 'abc123' } },
        warnings: [
          "warning: Failed to delete remote branch 'feature/cache': gh: Resource not accessible by integration (HTTP 403)",
        ],
      });
    });

    it('leaves deletion to gh for both, and skips it for none', async () => {
      const both = makeFakeGh();
      const none = makeFakeGh();

      const bothOutcome = await mergePullRequest({ ...SQUASH_REQUEST, deletionStrategy: 'both' }, both.run);
      const noneOutcome = await mergePullRequest({ ...SQUASH_REQUEST, deletionStrategy: 'none' }, none.run);

      expect(bothOutcome).toMatchObject({ result: { branchDeletion: 'by-gh' } });
      expect(noneOutcome).toMatchObject({ result: { branchDeletion: 'not-requested' } });
      expect([...both.calls, ...none.calls].some((args) => args[0] === 'api')).toBe(false);
    });
  });
});

// region | Helpers

interface FakeGhResponses {
  api?: GhResult;
  merge?: GhResult;
  view?: GhResult;
}

/** Returns a failed `gh` result with the given stderr. */
function fail(stderr: string): GhResult {
  return { exitCode: 1, stderr, stdout: '' };
}

/** Returns a `gh` runner that answers by subcommand and records every argument array that it receives. */
function makeFakeGh(responses: FakeGhResponses = {}): {
  calls: string[][];
  run: (args: readonly string[]) => Promise<GhResult>;
} {
  const calls: string[][] = [];
  return {
    calls,
    run: (args) => {
      calls.push([...args]);
      if (args[0] === 'api') {
        return Promise.resolve(responses.api ?? ok(''));
      }
      if (args[1] === 'merge') {
        return Promise.resolve(responses.merge ?? ok(''));
      }
      return Promise.resolve(responses.view ?? ok(JSON.stringify(MERGED_VIEW)));
    },
  };
}

/** Returns a successful `gh` result with the given stdout. */
function ok(stdout: string): GhResult {
  return { exitCode: 0, stderr: '', stdout };
}

// endregion | Helpers
