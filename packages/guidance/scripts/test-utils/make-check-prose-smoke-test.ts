import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Returns an invocation that checks a Markdown file outside any repository, whose only watchlist word sits in a code
 * span, and asserts that the bundle ran the overused-word detector and reported nothing.
 */
export function makeCheckProseSmokeTest(): SmokeTestInvocation {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-prose-'));
  const filePath = path.join(dir, 'prose-check.md');
  writeFileSync(filePath, 'The helper reads the file and calls `route` once.\n', 'utf8');
  return { args: ['--file', filePath, '--json'], cwd: dir, assertResult: assertCleanCheck };
}

// region | Helpers

/** Asserts that the parsed smoke-test result lists the overused-word rule and does not contain any candidate. */
function assertCleanCheck(result: unknown): void {
  if (!isRecord(result) || !Array.isArray(result['rules']) || !Array.isArray(result['candidates'])) {
    throw new TypeError('expected an object result with rules and candidates arrays');
  }
  if (!result['rules'].includes('overused-word') || result['candidates'].length > 0) {
    throw new Error(`expected the overused-word rule and an empty candidate list, got ${JSON.stringify(result)}`);
  }
}

// endregion | Helpers
