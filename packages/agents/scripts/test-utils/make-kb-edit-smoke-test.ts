import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { resolveKbDir } from '@williamthorsen/kb/layout';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Stands up a fixture KB with a single seed note and returns a `SmokeTestInvocation` that runs the bundle with
 * `--bump-updated` against it. Exercises the load → mutate → write-back pipeline end to end, which is the only
 * code path that wires the bundled record parse, mutation, and atomic write together. `HOME` is overridden to
 * the fixture dir so the dev's real `~/.claude/kb.yaml` does not pollute KB resolution.
 *
 * The fixture is process-lifetime — `mkdtempSync` runs when the smoke-test runner loads and the OS reclaims
 * short-lived temp directories without explicit cleanup. The seed note's `updated:` field is rewritten to the
 * current instant on every invocation.
 */
export function makeKbEditSmokeTest(): SmokeTestInvocation {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'kb-edit-smoke-'));
  mkdirSync(resolveKbDir(fixtureDir), { recursive: true });
  const notePath = path.join(fixtureDir, 'Smoke.md');
  writeFileSync(
    notePath,
    '---\ntitle: Smoke\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [smoke]\ntype: howto\n---\n\nSmoke body.\n',
    'utf8',
  );
  return {
    args: [notePath, '--bump-updated'],
    cwd: fixtureDir,
    env: { ...process.env, HOME: fixtureDir },
    assertResult: assertKbEditSmokeResult,
  };
}

// region | Helpers

/** Asserts that the kb-edit smoke produced an ok bump-updated result with second-precision UTC `updated:` timestamp. */
function assertKbEditSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from kb-edit');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (result.operation !== 'bump-updated') {
    throw new Error(`expected operation 'bump-updated', got ${JSON.stringify(result.operation)}`);
  }
  const record = result.record;
  if (!isRecord(record)) {
    throw new TypeError('expected record object on kb-edit result');
  }
  if (typeof record.updated !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.updated)) {
    throw new Error(`expected updated to be YYYY-MM-DDTHH:MM:SSZ, got ${JSON.stringify(record.updated)}`);
  }
}

// endregion | Helpers
