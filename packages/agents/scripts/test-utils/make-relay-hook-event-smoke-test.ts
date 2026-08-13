import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Stands up a throwaway git repo on a known branch with an `origin` remote, plus a fixture events root, then returns a
 * `SmokeTestInvocation` that pipes a Claude `SessionStart` payload at the relay exactly as the harness would.
 *
 * The bundle is the only place the relay's stdin read is exercised against a real pipe: the unit suite hands `runRelay`
 * a string, so a regression in the stream read — the one thing standing between a hook firing and an event existing —
 * would pass unit tests and fail silently in every installed harness.
 */
export function makeRelayHookEventSmokeTest(): SmokeTestInvocation {
  const home = mkdtempSync(path.join(tmpdir(), 'relay-hook-event-home-'));

  const repo = mkdtempSync(path.join(tmpdir(), 'relay-hook-event-repo-'));
  execFileSync('git', ['-C', repo, 'init', '--quiet', '--initial-branch=1005/smoke']);
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:williamthorsen/codeassembly.git']);

  const expectedPath = path.join(
    home,
    '.codeassembly',
    'events',
    'williamthorsen',
    'codeassembly',
    '1005-smoke',
    'smoke-session.jsonl',
  );

  return {
    args: ['--harness', 'claude', '--hook', 'SessionStart', '--home', home],
    stdin: JSON.stringify({
      session_id: 'smoke-session',
      cwd: repo,
      hook_event_name: 'SessionStart',
      source: 'startup',
    }),
    assertResult: (result) => assertRelayHookEventSmokeResult(result, expectedPath),
  };
}

// region | Helpers

/**
 * Assert the relay smoke read its payload from the pipe and appended a `session.started` envelope at the path the
 * payload's `cwd` implies — attribution the relay could only have derived from stdin, since it was spawned elsewhere.
 */
function assertRelayHookEventSmokeResult(result: unknown, expectedPath: string): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from relay-hook-event');
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
  const expectedFields: Record<string, unknown> = {
    type: 'session.started',
    repo: 'williamthorsen/codeassembly',
    branch: '1005/smoke',
    session: 'smoke-session',
    harness: 'claude',
  };
  for (const [field, expected] of Object.entries(expectedFields)) {
    if (envelope[field] !== expected) {
      throw new Error(`expected ${field} ${JSON.stringify(expected)}, got ${JSON.stringify(envelope[field])}`);
    }
  }
  if (!isRecord(envelope.payload) || envelope.payload.source !== 'startup') {
    throw new Error(`expected the start discriminator to pass through, got ${JSON.stringify(envelope.payload)}`);
  }
}

// endregion | Helpers
