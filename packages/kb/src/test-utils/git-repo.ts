import { execFileSync } from 'node:child_process';

/** Stages everything under `dir` and commits it with `message`, returning the new commit SHA. */
export function commitAll(dir: string, message: string): string {
  runGit(dir, 'add', '--all');
  runGit(dir, 'commit', '--quiet', '--message', message);
  return runGit(dir, 'rev-parse', 'HEAD').trim();
}

/** Initializes a git repository in `dir` with a deterministic identity and signing disabled, for fixture commits. */
export function initGitRepo(dir: string): void {
  runGit(dir, 'init', '--quiet');
  runGit(dir, 'config', 'user.email', 'test@example.com');
  runGit(dir, 'config', 'user.name', 'Test');
  runGit(dir, 'config', 'commit.gpgsign', 'false');
}

/** Runs `git` in `dir` with the given arguments and returns its UTF-8 stdout. For fixture setup only. */
export function runGit(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
}
