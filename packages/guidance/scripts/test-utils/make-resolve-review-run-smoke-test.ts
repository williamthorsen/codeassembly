import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

const RUN_DIR_NAME = '20261004-101500Z-interactive';

const REVIEW_FILE_NAME = '20261004-101500Z_reviewer_review.md';

/** Builds a ticket directory containing one run and its review, then returns an invocation that looks the review up. */
export function makeResolveReviewRunSmokeTest(): SmokeTestInvocation {
  const ticketDir = mkdtempSync(path.join(tmpdir(), 'resolve-review-run-'));
  const runDir = path.join(ticketDir, RUN_DIR_NAME);
  mkdirSync(runDir);
  writeFileSync(path.join(runDir, REVIEW_FILE_NAME), '', 'utf8');

  return {
    args: ['latest', '--ticket-dir', ticketDir],
    assertResult: (result) => {
      assertResolveReviewRunSmokeResult(result, runDir);
    },
  };
}

// region | Helpers

/** Asserts that the lookup returned the fixture's run directory and review. */
function assertResolveReviewRunSmokeResult(result: unknown, runDir: string): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from resolve-review-run');
  }
  if (result.runDir !== runDir || result.reviewPath !== path.join(runDir, REVIEW_FILE_NAME)) {
    throw new Error(`expected the fixture run and review, got ${JSON.stringify(result)}`);
  }
}

// endregion | Helpers
