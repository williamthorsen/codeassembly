import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { resolveKbDir } from '@williamthorsen/kb/layout';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Stands up an event store plus an isolated home registering it as `default_kb`, and a throwaway git repo with an
 * `origin` remote, then returns a `SmokeTestInvocation` that captures a single event against them with `--store
 * @default`. Exercises the full `@default` sentinel resolution → validate the `event` record's spine via `parseEvent` →
 * write pipeline end to end, which is the only path that wires the bundled resolver, the per-type record layer, and the
 * immutable write together.
 */
export function makeCaptureEventSmokeTest(): SmokeTestInvocation {
  const storePath = mkdtempSync(path.join(tmpdir(), 'capture-event-store-'));
  mkdirSync(resolveKbDir(storePath), { recursive: true });

  const home = mkdtempSync(path.join(tmpdir(), 'capture-event-home-'));
  mkdirSync(path.join(home, '.agents'), { recursive: true });
  writeFileSync(
    path.join(home, '.agents', 'kb.yaml'),
    `default_kb: codeassembly\nkbs:\n  codeassembly:\n    path: ${storePath}\n`,
    'utf8',
  );

  const repo = mkdtempSync(path.join(tmpdir(), 'capture-event-repo-'));
  execFileSync('git', ['-C', repo, 'init', '--quiet']);
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:williamthorsen/codeassembly.git']);

  return {
    args: ['--summary', 'Smoke-test event', '--store', '@default'],
    cwd: repo,
    env: { ...process.env, HOME: home, CLAUDE_CODE_SESSION_ID: 'smoke-session' },
    assertResult: assertCaptureEventSmokeResult,
  };
}

// region | Helpers

/**
 * Assert the capture-event smoke produced an ok result with a ULID id, ISO-8601 capturedAt, a written path carrying
 * the stored `recordType: event` discriminant, and no bare `type` field.
 */
function assertCaptureEventSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from capture-event');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (typeof result.id !== 'string' || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(result.id)) {
    throw new Error(`expected a ULID-shaped id, got ${JSON.stringify(result.id)}`);
  }
  if (typeof result.capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(result.capturedAt)) {
    throw new Error(`expected an ISO-8601 capturedAt, got ${JSON.stringify(result.capturedAt)}`);
  }
  if (typeof result.path !== 'string' || !result.path.endsWith(`${result.id}.md`)) {
    throw new Error(`expected a written record path ending in ${result.id}.md, got ${JSON.stringify(result.path)}`);
  }
  const written = readFileSync(result.path, 'utf8');
  if (!/^recordType: event$/m.test(written)) {
    throw new Error(`expected the written event to carry recordType: event, got:\n${written}`);
  }
  if (/^type:/m.test(written)) {
    throw new Error(`expected the written event to omit a bare type field, got:\n${written}`);
  }
}

// endregion | Helpers
