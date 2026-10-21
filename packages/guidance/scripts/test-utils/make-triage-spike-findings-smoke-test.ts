import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Puts a `gh` stand-in first on `PATH`, then returns an invocation that checks the repository's labels through it.
 * Exercises the entry point's wiring of the real command runner, which the unit tests replace with an injected one.
 */
export function makeTriageSpikeFindingsSmokeTest(): SmokeTestInvocation {
  const binDir = mkdtempSync(path.join(tmpdir(), 'triage-spike-findings-bin-'));
  const labels = JSON.stringify(
    ['bug', 'confidence:high', 'confidence:low', 'confidence:medium', 'value:must-have'].map((name) => ({ name })),
  );
  const ghPath = path.join(binDir, 'gh');
  writeFileSync(
    ghPath,
    `#!${process.execPath}\nif (process.argv[2] !== 'label' || process.argv[3] !== 'list') process.exit(1);\nprocess.stdout.write(${JSON.stringify(labels)});\n`,
  );
  chmodSync(ghPath, 0o755);

  return {
    args: ['check-labels'],
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env['PATH'] ?? ''}` },
    assertResult: assertTriageSpikeFindingsSmokeResult,
  };
}

// region | Helpers

/** Asserts that the stand-in's labels were read: the confidence family complete, three value labels missing. */
function assertTriageSpikeFindingsSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from triage-spike-findings');
  }
  const families = isRecord(result['families']) ? result['families'] : {};
  const confidence = isRecord(families['confidence']) ? families['confidence'] : {};
  const value = isRecord(families['value']) ? families['value'] : {};
  const expectedMissing = JSON.stringify(['value:nice-to-have', 'value:questionable', 'value:should-have']);
  if (
    result['ok'] !== true ||
    result['complete'] !== false ||
    JSON.stringify(confidence['missing']) !== '[]' ||
    JSON.stringify(value['missing']) !== expectedMissing
  ) {
    throw new Error(`expected the stand-in's label families, got ${JSON.stringify(result)}`);
  }
}

// endregion | Helpers
