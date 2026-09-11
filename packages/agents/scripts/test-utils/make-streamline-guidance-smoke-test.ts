import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

const PARTIAL = 'skills/_partials/shared.md';
const TARGET = 'skills/demo/SKILL.md';

/**
 * Stands up a throwaway git repository holding one content root, whose skill includes one partial, and returns a
 * `SmokeTestInvocation` that resolves the skill. Exercises the git listing, the include listing, and the transitive-file
 * pipeline end to end. `HOME` is overridden to the fixture directory so the developer's own preferences do not reach the
 * run.
 */
export function makeStreamlineGuidanceSmokeTest(): SmokeTestInvocation {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'streamline-guidance-smoke-'));
  execFileSync('git', ['-C', fixtureDir, 'init', '--quiet']);
  writeFixtureFile(fixtureDir, 'codeassembly-content.yaml', 'format: 2\n');
  writeFixtureFile(fixtureDir, PARTIAL, 'Shared text.\n');
  writeFixtureFile(fixtureDir, TARGET, '<!-- include: ../_partials/shared.md / -->\n');

  return {
    args: ['resolve', TARGET],
    cwd: fixtureDir,
    env: { ...process.env, HOME: fixtureDir },
    assertResult: assertStreamlineGuidanceSmokeResult,
  };
}

// region | Helpers

/**
 * Asserts that the run resolved the skill and reached its partial. A working pipeline always reports the partial, so
 * its absence means that the listing or the include resolution found nothing.
 */
function assertStreamlineGuidanceSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from streamline-guidance');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (!Array.isArray(result.transitive)) {
    throw new TypeError(`expected transitive to be an array, got ${JSON.stringify(result.transitive)}`);
  }
  const files = result.transitive.map((entry: unknown) => (isRecord(entry) ? entry.file : undefined));
  if (!files.includes(PARTIAL)) {
    throw new Error(`expected the smoke run to report the partial as transitive; got files: ${JSON.stringify(files)}`);
  }
}

/** Writes one fixture file, creating its directories. */
function writeFixtureFile(root: string, file: string, content: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), content, 'utf8');
}

// endregion | Helpers
