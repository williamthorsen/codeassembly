import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveCurrentBranch, sanitizeBranch } from '../branch-helpers.ts';

const execFileAsync = promisify(execFile);

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
    // Regression: a single-strip (`s.replace(/-$/, '')`) would yield `feat-`. The bash
    // sanitizer (`sanitize_branch` in `resolve-frontmatter.sh`) loops to match this.
    expect(sanitizeBranch('feat//')).toBe('feat');
  });
});

describe(resolveCurrentBranch, () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'branch-helpers-'));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('returns the checked-out branch name', async () => {
    await execFileAsync('git', ['-C', scratch, 'init', '--quiet', '--initial-branch=MAC-42/feat/thing']);

    await expect(resolveCurrentBranch(scratch)).resolves.toBe('MAC-42/feat/thing');
  });

  it('returns an empty string on a detached HEAD', async () => {
    await execFileAsync('git', ['-C', scratch, 'init', '--quiet', '--initial-branch=main']);
    await execFileAsync('git', [
      '-C',
      scratch,
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      'commit',
      '--quiet',
      '--allow-empty',
      '--message',
      'seed',
    ]);
    await execFileAsync('git', ['-C', scratch, 'checkout', '--quiet', '--detach']);

    // Git reports no branch rather than failing; each caller decides whether an empty branch is a
    // hard failure (the deriver) or an unresolvable field (emit-event).
    await expect(resolveCurrentBranch(scratch)).resolves.toBe('');
  });

  it('throws outside a git repository', async () => {
    await expect(resolveCurrentBranch(scratch)).rejects.toThrow(/Could not resolve current branch/);
  });

  it('attaches the git failure as the cause', async () => {
    await expect(resolveCurrentBranch(scratch)).rejects.toHaveProperty('cause', expect.any(Error));
  });
});
