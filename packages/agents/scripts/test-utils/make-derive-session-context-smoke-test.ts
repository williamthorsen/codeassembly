import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Builds a fixture directory containing a minimal preferences file and returns a `SmokeTestInvocation`
 * that drives the deriver against it with a known branch name. The deriver's output depends on the
 * surrounding cwd and the current git branch, so the smoke test cannot use the ambient environment.
 * `mkdtempSync` runs when the smoke-test runner loads and the directory is process-lifetime — short-lived
 * OS temp directories are reclaimed without explicit cleanup.
 */
export function makeDeriveSessionContextSmokeTest(): SmokeTestInvocation {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'derive-session-context-smoke-'));
  mkdirSync(path.join(fixtureDir, '.agents'), { recursive: true });
  writeFileSync(path.join(fixtureDir, '.agents', 'preferences.yaml'), 'project:\n  slug: smoke-test-project\n', 'utf8');
  return {
    // `--home` points at the fixture so the deriver does not read the developer's real
    // `~/.agents/preferences.yaml` (whose schema-validity is environment-specific). Using the flag
    // rather than the `HOME` env var avoids breaking PATH-resolution tools (e.g., asdf shims) that
    // depend on the real `HOME`.
    args: ['--branch', 'MAC-999/feat/smoke-fixture', '--cwd', fixtureDir, '--home', fixtureDir],
    assertResult: assertDeriveSessionContextOutput,
    cwd: fixtureDir,
  };
}

// region | Helpers

/** Asserts that the deriver emitted the expected field set for the smoke fixture. */
function assertDeriveSessionContextOutput(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from derive-session-context');
  }
  if (result.ticket_id !== 'MAC-999') {
    throw new Error(`expected ticket_id "MAC-999", got ${JSON.stringify(result.ticket_id)}`);
  }
  if (result.project_slug !== 'smoke-test-project') {
    throw new Error(`expected project_slug "smoke-test-project", got ${JSON.stringify(result.project_slug)}`);
  }
  if (result.branch_name !== 'MAC-999/feat/smoke-fixture') {
    throw new Error(`expected branch_name "MAC-999/feat/smoke-fixture", got ${JSON.stringify(result.branch_name)}`);
  }
  // `artifact_base_dir` is resolved by `resolveBaseDir`: the default `~/ai-artifacts` is expanded
  // against the `--home` flag (set to the fixture dir in `makeDeriveSessionContextSmokeTest`).
  // The bundled deriver is the only end-to-end path that exercises this expansion against a real
  // `os.homedir()`-equivalent argument, so the smoke test is the natural place to assert it.
  if (typeof result.artifact_base_dir !== 'string' || !result.artifact_base_dir.includes('ai-artifacts')) {
    throw new Error(
      `expected artifact_base_dir to include "ai-artifacts", got ${JSON.stringify(result.artifact_base_dir)}`,
    );
  }
  // `default_branch` comes from `composeManifest`'s remote-name resolution; the smoke fixture has
  // no `repository.default_remote` configured, so the default `origin/main` should surface.
  if (result.default_branch !== 'origin/main') {
    throw new Error(`expected default_branch "origin/main", got ${JSON.stringify(result.default_branch)}`);
  }
}

// endregion | Helpers
