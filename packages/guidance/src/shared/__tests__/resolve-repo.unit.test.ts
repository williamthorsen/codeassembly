import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { makeEnoentError, makeFakeGit } from '../../test-utils/make-fake-git.ts';
import { resolveRepo } from '../resolve-repo.ts';

describe(resolveRepo, () => {
  it('prefers the origin remote', async () => {
    const git = makeFakeGit({
      remotes: [
        { name: 'upstream', url: 'git@github.com:other/upstream.git' },
        { name: 'origin', url: 'git@github.com:owner/repo.git' },
      ],
    });

    await expect(resolveRepo('/repo', git)).resolves.toBe('owner/repo');
  });

  it('falls back to the first remote when origin is absent', async () => {
    const git = makeFakeGit({
      remotes: [
        { name: 'upstream', url: 'https://github.com/owner/upstream.git' },
        { name: 'fork', url: 'https://github.com/me/fork.git' },
      ],
    });

    await expect(resolveRepo('/repo', git)).resolves.toBe('owner/upstream');
  });

  it('returns undefined when the repository does not have any remotes', async () => {
    await expect(resolveRepo('/repo', makeFakeGit())).resolves.toBeUndefined();
  });

  it('returns undefined for a URL that does not parse to owner/repo', async () => {
    const git = makeFakeGit({ remotes: [{ name: 'origin', url: '/local/path/repo' }] });

    await expect(resolveRepo('/repo', git)).resolves.toBeUndefined();
  });

  it('returns undefined without a warning when git fails', async () => {
    using stdio = captureStdio();
    const git = makeFakeGit({ errors: { listRemotes: new Error('fatal: not a git repository') } });

    await expect(resolveRepo('/outside', git)).resolves.toBeUndefined();
    expect(stdio.stderr).toBe('');
  });

  it('warns and returns undefined when the git binary is absent', async () => {
    using stdio = captureStdio();
    const git = makeFakeGit({ errors: { listRemotes: makeEnoentError() } });

    await expect(resolveRepo('/repo', git)).resolves.toBeUndefined();
    expect(stdio.stderr).toMatch(/resolve-repo: warning: git is not available/);
  });
});
