import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Stands up a repository whose preferences configure a commit template, plus an empty home, then returns a
 * `SmokeTestInvocation` that reads a commit subject back through `parse-title`. The subcommand refuses without the
 * work-type taxonomy, which the run resolves through the `_data` directory of the `skills` sibling, so a bundle that
 * resolved it wrongly fails here.
 */
export function makeDescribeChangeSmokeTest(): SmokeTestInvocation {
  const repo = mkdtempSync(path.join(tmpdir(), 'describe-change-smoke-repo-'));
  execFileSync('git', ['init', '--quiet', repo]);
  mkdirSync(path.join(repo, '.agents'), { recursive: true });
  writeFileSync(
    path.join(repo, '.agents', 'preferences.yaml'),
    "commit:\n  title_format: '[[{scope}|]{type}: ]{title}'\n",
    'utf8',
  );
  const home = mkdtempSync(path.join(tmpdir(), 'describe-change-smoke-home-'));

  return {
    args: ['parse-title', 'commit', 'agents|feat!: Add the parser'],
    assertResult: assertDescribeChangeSmokeResult,
    cwd: repo,
    env: { ...process.env, HOME: home },
  };
}

// region | Helpers

/** Asserts that the subject read back into its scope, type, breaking marker, and title. */
function assertDescribeChangeSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from describe-change');
  }
  const expected = { breaking: true, matched: true, scope: 'agents', title: 'Add the parser', type: 'feat' };
  for (const [key, value] of Object.entries(expected)) {
    if (result[key] !== value) {
      throw new Error(`expected ${key} ${JSON.stringify(value)}, got ${JSON.stringify(result)}`);
    }
  }
}

// endregion | Helpers
