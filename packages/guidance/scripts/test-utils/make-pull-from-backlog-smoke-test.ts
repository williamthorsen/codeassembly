import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Builds a throwaway git repository with one commit and returns an invocation that records one pull in its ledger.
 * Exercises the commit lookup, the ledger's resolution through git, and its first append, none of which needs `gh`.
 */
export function makePullFromBacklogSmokeTest(): SmokeTestInvocation {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'pull-from-backlog-smoke-'));
  execFileSync('git', ['-C', fixtureDir, 'init', '--quiet']);
  execFileSync('git', [
    '-C',
    fixtureDir,
    '-c',
    'user.name=Smoke',
    '-c',
    'user.email=smoke@example.com',
    'commit',
    '--quiet',
    '--allow-empty',
    '--message',
    'Initial commit',
  ]);

  return {
    args: ['record', '--ticket', '1'],
    cwd: fixtureDir,
    env: { ...process.env, HOME: fixtureDir },
    assertResult: assertPullFromBacklogSmokeResult,
  };
}

// region | Helpers

/** Asserts that the pull was recorded, which a failed commit lookup, ledger resolution, or write would prevent. */
function assertPullFromBacklogSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from pull-from-backlog');
  }
  if (result.ok !== true || !isRecord(result.record) || result.record.kind !== 'pull') {
    throw new Error(`expected ok: true and a pull record, got ${JSON.stringify(result)}`);
  }
}

// endregion | Helpers
