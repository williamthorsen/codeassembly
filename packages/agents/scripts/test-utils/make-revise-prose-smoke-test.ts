import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Stands up a throwaway git repository holding one Markdown file with one known site, and returns a
 * `SmokeTestInvocation` that sweeps it. Exercises the git listing, the prose extraction, and the detection pipeline
 * end to end. `HOME` is overridden to the fixture dir so the dev's own preferences do not reach the run.
 */
export function makeReviseProseSmokeTest(): SmokeTestInvocation {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'revise-prose-smoke-'));
  execFileSync('git', ['-C', fixtureDir, 'init', '--quiet']);
  writeFileSync(path.join(fixtureDir, 'guide.md'), 'Finds the ticket a branch name encodes.\n', 'utf8');

  return {
    args: [],
    cwd: fixtureDir,
    env: { ...process.env, HOME: fixtureDir },
    assertResult: assertReviseProseSmokeResult,
  };
}

// region | Helpers

/**
 * Asserts that the sweep read the seed file rather than reporting an empty repository. The seed carries one site of
 * the construction, so a working pipeline always reports it; its absence means the listing or the extraction found
 * nothing, which must fail here rather than pass as a clean report.
 */
function assertReviseProseSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from revise-prose');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (!Array.isArray(result.candidates)) {
    throw new TypeError(`expected candidates to be an array, got ${JSON.stringify(result.candidates)}`);
  }
  const phrases = result.candidates.map((entry: unknown) => (isRecord(entry) ? entry.phrase : undefined));
  if (!phrases.includes('ticket a branch name encodes')) {
    throw new Error(`expected the smoke run to report the seed site; got phrases: ${JSON.stringify(phrases)}`);
  }
}

// endregion | Helpers
