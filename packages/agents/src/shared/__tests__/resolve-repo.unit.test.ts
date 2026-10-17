import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeFakeGit } from '../../lib/test-utils/make-fake-git.ts';
import { resolveRepo } from '../resolve-repo.ts';

describe(resolveRepo, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves the origin remote when there is one', async () => {
    const git = makeFakeGit({
      remotes: { upstream: 'https://github.com/acme/upstream.git', origin: 'git@github.com:acme/origin.git' },
    });

    expect(await resolveRepo('/repo', git)).toBe('acme/origin');
  });

  it('falls back to the first listed remote when origin is absent', async () => {
    const git = makeFakeGit({
      remotes: { upstream: 'https://github.com/acme/upstream.git', mirror: 'https://github.com/acme/mirror.git' },
    });

    expect(await resolveRepo('/repo', git)).toBe('acme/upstream');
  });

  it('returns undefined for a repository without a remote', async () => {
    expect(await resolveRepo('/repo', makeFakeGit({ remotes: {} }))).toBeUndefined();
  });

  it('returns undefined for a remote URL that does not parse', async () => {
    expect(await resolveRepo('/repo', makeFakeGit({ remotes: { origin: 'not a url' } }))).toBeUndefined();
  });

  it('warns once when git is not available, and returns undefined', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const missing = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });

    expect(await resolveRepo('/repo', makeFakeGit({ remotes: missing }))).toBeUndefined();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('git is not available'));
  });

  it('stays silent when git fails for another reason', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    expect(await resolveRepo('/repo', makeFakeGit({ remotes: new Error('not a git repository') }))).toBeUndefined();
    expect(stderr).not.toHaveBeenCalled();
  });
});
