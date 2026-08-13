import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Stands up a throwaway git repo on a known branch with an `origin` remote, plus a fixture events root, then returns a
 * `SmokeTestInvocation` that emits one event against them. Exercises the full context-autofill → envelope → append
 * pipeline: the git-derived `repo` and `branch`, the relayed `--session`, and the single-line append are only wired
 * together in the built bundle.
 *
 * The branch is pinned via `--initial-branch` so the expected path is deterministic; the ambient git config could
 * otherwise name the initial branch anything. `--home` points the events root at the fixture rather than overriding
 * `HOME`, which would break PATH-resolution tools that depend on the real one (the hazard the deriver's smoke test
 * documents).
 */
export function makeEmitEventSmokeTest(): SmokeTestInvocation {
  const home = mkdtempSync(path.join(tmpdir(), 'emit-event-home-'));

  const repo = mkdtempSync(path.join(tmpdir(), 'emit-event-repo-'));
  execFileSync('git', ['-C', repo, 'init', '--quiet', '--initial-branch=986/smoke']);
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:williamthorsen/codeassembly.git']);

  const expectedPath = path.join(
    home,
    '.codeassembly',
    'events',
    'williamthorsen',
    'codeassembly',
    '986-smoke',
    'smoke-session.jsonl',
  );

  return {
    args: [
      '--type',
      'skill.started',
      '--payload',
      '{"skill":"emit-event"}',
      '--harness',
      'claude',
      '--session',
      'smoke-session',
      '--home',
      home,
    ],
    cwd: repo,
    assertResult: (result) => assertEmitEventSmokeResult(result, expectedPath, repo),
  };
}

// region | Helpers

/**
 * Assert the emit-event smoke appended an envelope at the path the derived context implies, and that the line on disk
 * parses with the autofilled `repo`/`branch`/`session`/`cwd`, the injected harness, and the supplied payload.
 */
function assertEmitEventSmokeResult(result: unknown, expectedPath: string, repo: string): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from emit-event');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (result.path !== expectedPath) {
    throw new Error(`expected the event at ${expectedPath}, got ${JSON.stringify(result.path)}`);
  }

  const lines = readFileSync(expectedPath, 'utf8').split('\n').filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(`expected exactly one appended line, got ${lines.length}`);
  }
  const envelope: unknown = JSON.parse(lines[0] ?? '');
  if (!isRecord(envelope)) {
    throw new TypeError(`expected the appended line to be a JSON object, got: ${lines[0]}`);
  }
  if (envelope.id !== result.id) {
    throw new Error(`expected the appended id to match the reported one, got ${JSON.stringify(envelope.id)}`);
  }
  const expectedFields: Record<string, unknown> = {
    type: 'skill.started',
    repo: 'williamthorsen/codeassembly',
    branch: '986/smoke',
    session: 'smoke-session',
    harness: 'claude',
  };
  for (const [field, expected] of Object.entries(expectedFields)) {
    if (envelope[field] !== expected) {
      throw new Error(`expected ${field} ${JSON.stringify(expected)}, got ${JSON.stringify(envelope[field])}`);
    }
  }
  // `cwd` is the realpath of the fixture repo: macOS resolves the `/var` temp dir to `/private/var`, so compare on the
  // basename rather than the raw `mkdtemp` path.
  if (typeof envelope.cwd !== 'string' || !envelope.cwd.endsWith(path.basename(repo))) {
    throw new Error(`expected cwd to name the fixture repo, got ${JSON.stringify(envelope.cwd)}`);
  }
  if (!isRecord(envelope.payload) || envelope.payload.skill !== 'emit-event') {
    throw new Error(`expected the supplied payload, got ${JSON.stringify(envelope.payload)}`);
  }
}

// endregion | Helpers
