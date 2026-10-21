import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Builds a bare remote whose `main` is one commit ahead of a clone, and returns an invocation that checks the clone.
 * Exercises the fetch and the counts, which the bundle runs through real git.
 */
export function makeCheckBranchCurrencySmokeTest(): SmokeTestInvocation {
  const root = mkdtempSync(path.join(tmpdir(), 'check-branch-currency-smoke-'));
  const remote = path.join(root, 'remote.git');
  const upstream = path.join(root, 'upstream');
  const work = path.join(root, 'work');

  runGit(root, 'init', '--quiet', '--bare', '--initial-branch=main', remote);
  runGit(root, 'clone', '--quiet', remote, upstream);
  runGit(upstream, 'checkout', '--quiet', '-B', 'main');
  runGit(upstream, 'commit', '--quiet', '--allow-empty', '--message', 'Initial commit');
  runGit(upstream, 'push', '--quiet', 'origin', 'main');
  runGit(root, 'clone', '--quiet', remote, work);
  runGit(upstream, 'commit', '--quiet', '--allow-empty', '--message', 'Upstream change');
  runGit(upstream, 'push', '--quiet', 'origin', 'main');

  return {
    args: ['--base', 'origin/main'],
    cwd: work,
    assertResult: assertCheckBranchCurrencySmokeResult,
  };
}

// region | Helpers

/** Asserts that the clone was reported one commit behind, which a failed fetch would prevent. */
function assertCheckBranchCurrencySmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from check-branch-currency');
  }
  if (result['fetched'] !== true || result['behind'] !== 1 || result['ahead'] !== 0) {
    throw new Error(`expected fetched: true, behind: 1, ahead: 0, got ${JSON.stringify(result)}`);
  }
}

/** Runs git in `cwd` with a fixed identity and automatic maintenance disabled. */
function runGit(cwd: string, ...args: string[]): void {
  execFileSync(
    'git',
    [
      '-c',
      'gc.auto=0',
      '-c',
      'maintenance.auto=false',
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      ...args,
    ],
    { cwd, stdio: 'ignore' },
  );
}

// endregion | Helpers
