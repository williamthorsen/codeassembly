import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Builds a throwaway git repository and returns an invocation that appends one note to its ledger. Exercises the
 * ledger's resolution through git and its first append, neither of which needs `gh`.
 */
export function makeGroomBacklogSmokeTest(): SmokeTestInvocation {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'groom-backlog-smoke-'));
  execFileSync('git', ['-C', fixtureDir, 'init', '--quiet']);

  return {
    args: ['record', '--run', 'smoke'],
    stdin: JSON.stringify({ kind: 'note', text: 'Smoke test' }),
    cwd: fixtureDir,
    env: { ...process.env, HOME: fixtureDir },
    assertResult: assertGroomBacklogSmokeResult,
  };
}

// region | Helpers

/** Asserts that the note was appended, which a failed ledger resolution or write would prevent. */
function assertGroomBacklogSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from groom-backlog');
  }
  if (result.ok !== true || result.appended !== 1) {
    throw new Error(`expected ok: true and one appended record, got ${JSON.stringify(result)}`);
  }
}

// endregion | Helpers
