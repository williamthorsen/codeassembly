import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkGitIgnored } from '../git-ignore.ts';

const execFileAsync = promisify(execFile);

describe(checkGitIgnored, () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = path.join(tmpdir(), `agents-test-git-ignore-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(scratch, { recursive: true });
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  /** Turns the scratch dir into a repository carrying the given ignore rules. */
  async function initRepo(ignoreRules: string): Promise<void> {
    await execFileAsync('git', ['-C', scratch, 'init', '--quiet']);
    await writeFile(path.join(scratch, '.gitignore'), ignoreRules, 'utf8');
  }

  it('reports an ignored path as ignored', async () => {
    await initRepo('*.local.*\n');
    const target = path.join(scratch, 'CLAUDE.local.md');
    await writeFile(target, '# Notes\n', 'utf8');

    expect(await checkGitIgnored(scratch, target)).toBe(true);
  });

  it('reports a path no rule covers as not ignored', async () => {
    await initRepo('node_modules/\n');
    const target = path.join(scratch, 'CLAUDE.local.md');
    await writeFile(target, '# Notes\n', 'utf8');

    expect(await checkGitIgnored(scratch, target)).toBe(false);
  });

  it('answers for a path that does not exist yet, so a caller can check before writing', async () => {
    await initRepo('*.local.*\n');

    expect(await checkGitIgnored(scratch, path.join(scratch, 'CLAUDE.local.md'))).toBe(true);
    expect(await checkGitIgnored(scratch, path.join(scratch, 'CLAUDE.md'))).toBe(false);
  });

  it('returns undefined outside a repository, distinguishing "cannot answer" from "not ignored"', async () => {
    expect(await checkGitIgnored(scratch, path.join(scratch, 'CLAUDE.local.md'))).toBeUndefined();
  });
});
