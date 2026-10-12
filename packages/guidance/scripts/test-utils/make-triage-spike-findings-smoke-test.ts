import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Writes a dispositions record with one ticket item and returns an invocation that validates it. Exercises the record
 * read → schema → gate pipeline without `gh`.
 */
export function makeTriageSpikeFindingsSmokeTest(): SmokeTestInvocation {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'triage-spike-findings-smoke-'));
  const file = path.join(fixtureDir, 'dispositions.json');
  writeFileSync(
    file,
    JSON.stringify({
      source: 'smoke findings',
      triageTicket: 1,
      umbrella: null,
      items: [
        {
          id: '1',
          title: 'Smoke item',
          disposition: 'ticket',
          confidence: 'high',
          value: 'must-have',
          reason: 'Smoke test.',
          target: null,
          ticket: null,
          challenge: { argument: 'None.', outcome: 'defended', note: '' },
        },
      ],
      challengeSummary: 'Smoke test.',
      notes: [],
    }),
    'utf8',
  );
  return { args: ['validate', '--file', file], assertResult: assertTriageSpikeFindingsSmokeResult };
}

// region | Helpers

/** Asserts that the record passed the gate and its one item was counted. */
function assertTriageSpikeFindingsSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from triage-spike-findings');
  }
  if (result.ok !== true || result.items !== 1) {
    throw new Error(`expected ok: true and one item, got ${JSON.stringify(result)}`);
  }
}

// endregion | Helpers
