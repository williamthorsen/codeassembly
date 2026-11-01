import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Writes a triage record with one surfaced cluster awaiting its writes, then returns an invocation that validates it.
 * Exercises the record read → schema → rules pipeline through the bundle.
 */
export function makeTriageFeedbackSmokeTest(): SmokeTestInvocation {
  const dir = mkdtempSync(path.join(tmpdir(), 'triage-feedback-'));
  const file = path.join(dir, 'record.json');
  const record = {
    store: 'codeassembly',
    limit: 5,
    artifactPath: '~/ai-artifacts/feedback-triage/20261101-120000Z_smoke_feedback-triage.md',
    clusters: [
      {
        id: 'smoke',
        lesson: 'A smoke lesson.',
        eventIds: ['smoke-event'],
        signals: {
          recurrence: 1,
          impact: { critical: 0, high: 0, medium: 0, low: 0, unrated: 1 },
          firstCapturedAt: '2026-06-18T09:41:02Z',
          latestCapturedAt: '2026-06-18T09:41:02Z',
          status: 'eligible',
        },
        priority: 'medium',
        reason: 'Smoke.',
        challenge: { argument: 'Smoke.', outcome: 'defended', note: 'Smoke.' },
        surfaced: true,
        suggested: { kind: 'defer' },
        decision: 'approved',
        result: null,
      },
    ],
    remainder: { clusters: 0, events: 0, excluded: 0 },
  };
  writeFileSync(file, JSON.stringify(record), 'utf8');

  return {
    args: ['validate', '--file', file],
    assertResult: assertTriageFeedbackSmokeResult,
  };
}

// region | Helpers

/** Asserts that the record validated with its one cluster surfaced and pending. */
function assertTriageFeedbackSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from triage-feedback');
  }
  if (
    result['ok'] !== true ||
    JSON.stringify(result['surfaced']) !== '["smoke"]' ||
    JSON.stringify(result['pending']) !== '["smoke"]'
  ) {
    throw new Error(`expected the smoke cluster surfaced and pending, got ${JSON.stringify(result)}`);
  }
}

// endregion | Helpers
