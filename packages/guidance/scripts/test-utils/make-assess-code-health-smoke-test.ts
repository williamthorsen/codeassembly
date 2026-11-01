import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Returns an invocation of `check-tracked` against a prior evidence block, with a failing `gh` stand-in first on `PATH`.
 * Exercises the entry point's wiring of the real command runner, file reader, and git adapter, which the unit tests
 * replace with injected ones.
 */
export function makeAssessCodeHealthSmokeTest(): SmokeTestInvocation {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'assess-code-health-smoke-'));
  const ghPath = path.join(fixtureDir, 'gh');
  writeFileSync(ghPath, `#!${process.execPath}\nprocess.exit(1);\n`);
  chmodSync(ghPath, 0o755);

  const proposal = {
    id: 'S1',
    title: 'Split run',
    key: KEY,
    paths: ['src/a.ts'],
    evidence: [{ kind: 'sensor', sensor: 'hotspots', detail: 'rank 1' }],
    change: 'Extract a helper.',
    strength: 'sensor',
    size: 'small',
    reach: 1,
  };
  writeFileSync(path.join(fixtureDir, 'proposals.json'), JSON.stringify([proposal]));
  const block = {
    version: 1,
    source: 'findings.md',
    triageTicket: 1,
    commit: 'a'.repeat(40),
    items: [{ id: '1', key: KEY, paths: ['src/a.ts'], disposition: 'drop', where: null }],
  };
  writeFileSync(
    path.join(fixtureDir, 'prior.md'),
    `## Dispositions\n\n<!-- codeassembly:triage-evidence v1\n${JSON.stringify(block)}\n-->\n`,
  );

  return {
    args: ['check-tracked', '--proposals', 'proposals.json', '--prior', 'prior.md'],
    cwd: fixtureDir,
    env: { ...process.env, PATH: `${fixtureDir}${path.delimiter}${process.env['PATH'] ?? ''}` },
    assertResult: assertAssessCodeHealthSmokeResult,
  };
}

// region | Helpers

const KEY = 'src/a.ts:long-function';

/** Asserts that the tracker was reported unchecked and that the prior block tracked the proposal. */
function assertAssessCodeHealthSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from assess-code-health');
  }
  const tracker = isRecord(result['tracker']) ? result['tracker'] : {};
  const tracked = Array.isArray(result['tracked']) ? result['tracked'] : [];
  const first: unknown = tracked[0];
  if (result['ok'] !== true || tracker['checked'] !== false || !isRecord(first) || first['id'] !== 'S1') {
    throw new Error(`expected the prior block to track S1 with the tracker unchecked, got ${JSON.stringify(result)}`);
  }
}

// endregion | Helpers
