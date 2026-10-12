import { execFileSync } from 'node:child_process';

/** Stages everything under `dir` and commits it with `message`, returning the new commit SHA. */
export function commitAll(dir: string, message: string): string {
  runGitInFixture(dir, 'add', '--all');
  runGitInFixture(dir, 'commit', '--quiet', '--message', message);
  return runGitInFixture(dir, 'rev-parse', 'HEAD').trim();
}

/**
 * Initializes a git repository in `dir` with a deterministic identity, signing disabled, and automatic maintenance
 * disabled, whose background run can still be writing into `.git/` when the test removes the directory.
 */
export function initGitRepo(dir: string): void {
  runGitInFixture(dir, 'init', '--quiet');
  runGitInFixture(dir, 'config', 'user.email', 'test@example.com');
  runGitInFixture(dir, 'config', 'user.name', 'Test');
  runGitInFixture(dir, 'config', 'commit.gpgsign', 'false');
  runGitInFixture(dir, 'config', 'maintenance.auto', 'false');
  runGitInFixture(dir, 'config', 'gc.auto', '0');
}

/** Runs `git` in `dir` with the given arguments and returns its UTF-8 stdout. For fixture setup only. */
export function runGitInFixture(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
}
