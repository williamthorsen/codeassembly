import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Returns an invocation that checks a preferences file with a declared stage and one misspelt key, and asserts that the
 * bundled schema accepts the stage and reports the misspelling as a warning.
 */
export function makeValidatePreferencesSmokeTest(): SmokeTestInvocation {
  const dir = mkdtempSync(path.join(tmpdir(), 'validate-preferences-'));
  const filePath = path.join(dir, 'preferences.yaml');
  writeFileSync(filePath, 'project:\n  maturity: hobby\n  sensitivity: low\n  audience: owner\nprojct: {}\n', 'utf8');
  return { args: ['--json', filePath], assertResult: assertOneWarning };
}

// region | Helpers

/** Asserts that the parsed smoke-test result is valid and reports the misspelt key alone. */
function assertOneWarning(result: unknown): void {
  if (!isRecord(result) || !Array.isArray(result['findings'])) {
    throw new TypeError('expected an object result with a findings array');
  }
  const finding: unknown = result['findings'][0];
  if (
    result['valid'] !== true ||
    result['findings'].length !== 1 ||
    !isRecord(finding) ||
    finding['path'] !== 'projct'
  ) {
    throw new Error(`expected one warning at 'projct', got ${JSON.stringify(result)}`);
  }
}

// endregion | Helpers
