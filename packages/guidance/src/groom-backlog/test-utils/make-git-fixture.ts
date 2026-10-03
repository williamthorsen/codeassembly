import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Runs git in `cwd` with a fixed identity, and returns its trimmed stdout. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

/** Creates a repository in a fresh temporary directory, on `main`, with one empty commit. */
export function makeGitFixture(prefix: string): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  git(root, 'init', '--quiet', '--initial-branch=main');
  git(root, 'commit', '--quiet', '--allow-empty', '--message', 'Initial commit');
  return root;
}
