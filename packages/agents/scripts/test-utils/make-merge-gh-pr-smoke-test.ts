import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Puts a `gh` stand-in first on `PATH`, then returns an invocation that rebases PR 42 and deletes its branch through
 * it. The stand-in reports the PR as merged and every call as successful, so the run exercises the merge, the state
 * check, and the deletion without reaching GitHub.
 */
export function makeMergeGhPrSmokeTest(): SmokeTestInvocation {
  const binDir = mkdtempSync(path.join(tmpdir(), 'merge-gh-pr-bin-'));
  const view = JSON.stringify({
    state: 'MERGED',
    mergeCommit: { oid: 'abc123' },
    url: 'https://github.com/acme/widgets/pull/42',
    mergedAt: '2026-09-28T22:00:00Z',
    headRefName: 'smoke/branch',
    headRepository: { name: 'widgets' },
    headRepositoryOwner: { login: 'acme' },
  });
  const ghPath = path.join(binDir, 'gh');
  writeFileSync(
    ghPath,
    `#!${process.execPath}\nif (process.argv[3] === 'view') process.stdout.write(${JSON.stringify(view)});\n`,
  );
  chmodSync(ghPath, 0o755);

  return {
    args: ['--pr', '42', '--strategy', 'rebase', '--delete', 'remote'],
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}` },
    assertResult: assertBranchDeleted,
  };
}

// region | Helpers

/** Asserts that the parsed result reports the merge commit and a deleted branch. */
function assertBranchDeleted(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result');
  }
  if (result.branchDeletion !== 'deleted') {
    throw new Error(`expected branchDeletion: deleted, got ${JSON.stringify(result.branchDeletion)}`);
  }
  if (!isRecord(result.mergeCommit) || result.mergeCommit.oid !== 'abc123') {
    throw new Error(`expected mergeCommit.oid abc123, got ${JSON.stringify(result.mergeCommit)}`);
  }
}

// endregion | Helpers
