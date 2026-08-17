import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { resolveEventsDir, resolveKbDir } from '@williamthorsen/kb/layout';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/** The lede-decision records the fixture corpus holds, oldest first. */
const FIXTURE_DECISIONS = [
  { id: 'A', type: 'ci', capturedAt: '2026-01-01T00:00:00Z' },
  { id: 'B', type: 'feat', capturedAt: '2026-02-01T00:00:00Z' },
  { id: 'C', type: 'feat', capturedAt: '2026-03-01T00:00:00Z' },
];

/**
 * Stands up a lede-decision corpus plus an isolated home registering it, then returns a `SmokeTestInvocation` that
 * selects two `feat` exemplars from it. Unlike the kb-retrieve-events smoke test this exercises the whole path:
 * selection scans the events directory itself, so nothing puts ripgrep on the build's critical path.
 *
 * The invocation passes no `--data-dir`, so the run resolves the work-type taxonomy the way an installed helper does —
 * through the `_data` directory of the `skills` sibling — and a bundle that resolved it wrongly fails here.
 */
export function makeSelectLedeExemplarsSmokeTest(): SmokeTestInvocation {
  const storePath = mkdtempSync(path.join(tmpdir(), 'select-lede-exemplars-store-'));
  mkdirSync(resolveKbDir(storePath), { recursive: true });
  const eventsDir = resolveEventsDir(storePath);
  mkdirSync(eventsDir, { recursive: true });
  for (const decision of FIXTURE_DECISIONS) {
    writeFileSync(path.join(eventsDir, `${decision.id}.md`), renderDecision(decision), 'utf8');
  }

  const home = mkdtempSync(path.join(tmpdir(), 'select-lede-exemplars-home-'));
  mkdirSync(path.join(home, '.agents'), { recursive: true });
  writeFileSync(
    path.join(home, '.agents', 'kb.yaml'),
    `default_kb: codeassembly\nkbs:\n  codeassembly:\n    path: ${storePath}\n`,
    'utf8',
  );

  return {
    args: ['--type', 'feat', '--count', '2'],
    env: { ...process.env, HOME: home },
    assertResult: assertSelectLedeExemplarsSmokeResult,
  };
}

// region | Helpers

/** Assert the smoke selected both `feat` exemplars from the fixture corpus without widening. */
function assertSelectLedeExemplarsSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from select-lede-exemplars');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (result.type !== 'feat' || result.tier !== 'public') {
    throw new Error(`expected the request to resolve to feat/public, got ${JSON.stringify(result)}`);
  }
  if (result.widening !== 'none') {
    throw new Error(`expected the exact type to fill the count, got widening ${JSON.stringify(result.widening)}`);
  }
  if (!Array.isArray(result.exemplars) || result.exemplars.length !== 2) {
    throw new Error(`expected two exemplars, got ${JSON.stringify(result.exemplars)}`);
  }
  const newest: unknown = result.exemplars[0];
  if (!isRecord(newest) || newest.lede !== 'Agent lede of C.' || newest.capturedAt !== '2026-03-01T00:00:00Z') {
    throw new Error(`expected the newest exemplar first, got ${JSON.stringify(newest)}`);
  }
}

/** Renders a decision record in the shape `capture-lede-decision` writes. */
function renderDecision(decision: { id: string; type: string; capturedAt: string }): string {
  return [
    '---',
    'recordType: event',
    `id: ${decision.id}`,
    `captured-at: ${decision.capturedAt}`,
    'cwd: /repo',
    `summary: 'Lede accepted for agents #${decision.id}'`,
    `tags: [lede-decision, type:${decision.type}, accepted]`,
    `type: ${decision.type}`,
    `tier: ${decision.type === 'feat' ? 'public' : 'process'}`,
    'scope: agents',
    "pr: '1'",
    '---',
    '',
    `## Agent lede\n\nAgent lede of ${decision.id}.\n`,
  ].join('\n');
}

// endregion | Helpers
