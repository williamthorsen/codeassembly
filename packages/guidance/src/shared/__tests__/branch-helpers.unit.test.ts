import { describe, expect, it } from 'vitest';

import { makeFakeGit } from '../../test-utils/make-fake-git.ts';
import { resolveCurrentBranch, sanitizeBranch } from '../branch-helpers.ts';

describe(sanitizeBranch, () => {
  it('replaces forward slashes with hyphens', () => {
    expect(sanitizeBranch('feat/foo/bar')).toBe('feat-foo-bar');
  });

  it('preserves underscores', () => {
    expect(sanitizeBranch('MAC-130_foo')).toBe('MAC-130_foo');
  });

  it('strips trailing hyphens after replacement', () => {
    expect(sanitizeBranch('feat/')).toBe('feat');
  });

  it('trims surrounding whitespace before processing', () => {
    expect(sanitizeBranch('  feat/foo  ')).toBe('feat-foo');
  });

  it('strips all trailing hyphens produced by consecutive slash replacement', () => {
    // Regression: A single-strip (`s.replace(/-$/, '')`) would yield `feat-`. The bash
    // sanitizer (`sanitize_branch` in `resolve-frontmatter.sh`) loops to match this.
    expect(sanitizeBranch('feat//')).toBe('feat');
  });
});

describe(resolveCurrentBranch, () => {
  it('returns the checked-out branch name', async () => {
    await expect(resolveCurrentBranch('/repo', makeFakeGit({ branch: 'feat/foo' }))).resolves.toBe('feat/foo');
  });

  it('returns an empty string on a detached HEAD', async () => {
    // Git reports an empty branch name rather than failing; the caller decides whether that is a failure.
    await expect(resolveCurrentBranch('/repo', makeFakeGit({ branch: '' }))).resolves.toBe('');
  });

  it('throws with the git failure as the cause when git fails', async () => {
    const failure = new Error('fatal: not a git repository');
    const git = makeFakeGit({ errors: { findCurrentBranch: failure } });

    const rejection = resolveCurrentBranch('/outside', git);

    await expect(rejection).rejects.toThrow(/Could not resolve current branch/);
    await expect(rejection).rejects.toHaveProperty('cause', failure);
  });
});
