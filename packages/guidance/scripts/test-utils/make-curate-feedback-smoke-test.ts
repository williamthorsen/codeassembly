import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Writes a curation record with one obsolete event, then returns an invocation that renders it. Exercises the record
 * read → schema → render → write pipeline through the bundle.
 */
export function makeCurateFeedbackSmokeTest(): SmokeTestInvocation {
  const dir = mkdtempSync(path.join(tmpdir(), 'curate-feedback-'));
  const file = path.join(dir, 'record.json');
  const out = path.join(dir, 'artifact.md');
  const record = {
    store: 'codeassembly',
    pins: [],
    events: [{ id: 'smoke-event', summary: 'Smoke.', bin: 'obsolete', reason: 'Smoke.', file: 'bins-01.json' }],
    counts: { covered: 0, duplicate: 0, obsolete: 1, kept: 0 },
    marks: { addressedBy: [], obsolete: { eventIds: ['smoke-event'], result: null } },
  };
  writeFileSync(file, JSON.stringify(record), 'utf8');

  return {
    args: ['render', '--file', file, '--out', out],
    assertResult: (result) => assertCurateFeedbackSmokeResult(result, out),
  };
}

// region | Helpers

/** Asserts that the render succeeded and wrote the count lines to the artifact body. */
function assertCurateFeedbackSmokeResult(result: unknown, out: string): void {
  if (!isRecord(result) || result['ok'] !== true) {
    throw new TypeError(`expected ok result from curate-feedback, got ${JSON.stringify(result)}`);
  }
  if (!readFileSync(out, 'utf8').includes('- obsolete: 1')) {
    throw new Error('expected the rendered artifact to contain the obsolete count');
  }
}

// endregion | Helpers
