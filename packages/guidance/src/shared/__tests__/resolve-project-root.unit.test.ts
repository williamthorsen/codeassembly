import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { makeFakeGit } from '../../test-utils/make-fake-git.ts';
import { resolveProjectRoot } from '../resolve-project-root.ts';

describe(resolveProjectRoot, () => {
  it('returns an explicit cwd override verbatim without invoking git', () => {
    const git = makeFakeGit({ errors: { findTopLevel: new Error('git must not run') } });

    expect(resolveProjectRoot({ cwd: '/explicit/override', git, startDir: '/start' })).toBe('/explicit/override');
  });

  it('treats an empty cwd override as unset and falls through to the git root', () => {
    // The `--cwd=` flag form yields an empty string; it must not anchor at `''`.
    const git = makeFakeGit({ topLevel: { root: '/repo' } });

    expect(resolveProjectRoot({ cwd: '', git, startDir: '/repo/packages/nested' })).toBe('/repo');
  });

  it('returns the git root for the start directory', () => {
    const git = makeFakeGit({ topLevel: { root: '/repo' } });

    expect(resolveProjectRoot({ git, startDir: '/repo/packages/nested' })).toBe('/repo');
  });

  it('falls back to the start directory and quotes git when the root cannot be resolved', () => {
    using stdio = captureStdio();
    const git = makeFakeGit({ topLevel: { failure: "fatal: not a git repository: '/nonexistent/x'" } });

    expect(resolveProjectRoot({ git, startDir: '/start' })).toBe('/start');
    expect(stdio.stderr).toMatch(/git could not resolve the repository root/);
    expect(stdio.stderr).toMatch(/not a git repository: '\/nonexistent\/x'/);
    expect(stdio.stdout).toBe('');
  });
});
