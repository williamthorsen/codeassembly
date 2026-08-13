import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { resolveEventPath, resolveEventsDir, resolveKbDir } from '@williamthorsen/kb/layout';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Stands up an event store carrying a seed event plus an isolated home registering it as `default_kb`, then returns a
 * `SmokeTestInvocation` that marks the event `addressed-by` a reference with `--store @default`. Exercises the full
 * `@default` resolution → read → parse → mutate → atomic write pipeline, the only path that wires the bundled resolver,
 * the per-type record layer, and the note-io writer together. The assertion confirms the reference landed and that no
 * `title`/`created`/`updated` was injected onto the event.
 */
export function makeKbUpdateEventsSmokeTest(): SmokeTestInvocation {
  const storePath = mkdtempSync(path.join(tmpdir(), 'kb-update-events-store-'));
  mkdirSync(resolveKbDir(storePath), { recursive: true });

  mkdirSync(resolveEventsDir(storePath), { recursive: true });
  const eventPath = resolveEventPath({ storePath, id: 'smoke-event' });
  writeFileSync(
    eventPath,
    [
      '---',
      'recordType: event',
      'id: smoke-event',
      'captured-at: 2026-06-18T09:41:02Z',
      'session: smoke',
      'cwd: /tmp/smoke',
      'summary: Smoke event',
      '---',
      '',
      'Body.',
      '',
    ].join('\n'),
    'utf8',
  );

  const home = mkdtempSync(path.join(tmpdir(), 'kb-update-events-home-'));
  mkdirSync(path.join(home, '.agents'), { recursive: true });
  writeFileSync(
    path.join(home, '.agents', 'kb.yaml'),
    `default_kb: codeassembly\nkbs:\n  codeassembly:\n    path: ${storePath}\n`,
    'utf8',
  );

  return {
    args: ['--store', '@default', '--add-addressed-by', '#849', 'smoke-event'],
    env: { ...process.env, HOME: home },
    assertResult: (result) => assertKbUpdateEventsSmokeResult(result, eventPath),
  };
}

// region | Helpers

/**
 * Assert the kb-update-events smoke produced an ok batch whose one event updated, with the reference written to its
 * `addressed-by` list and no assertion fields injected.
 */
function assertKbUpdateEventsSmokeResult(result: unknown, eventPath: string): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from kb-update-events');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (result.operation !== 'add-addressed-by') {
    throw new Error(`expected operation 'add-addressed-by', got ${JSON.stringify(result.operation)}`);
  }
  if (!Array.isArray(result.results) || result.results.length !== 1) {
    throw new Error(`expected one per-event result, got ${JSON.stringify(result.results)}`);
  }
  const entry: unknown = result.results[0];
  if (!isRecord(entry) || entry.ok !== true) {
    throw new Error(`expected the event to update, got ${JSON.stringify(entry)}`);
  }
  const written = readFileSync(eventPath, 'utf8');
  if (!/^addressed-by:/m.test(written)) {
    throw new Error(`expected the written event to carry addressed-by, got:\n${written}`);
  }
  if (!written.includes('#849')) {
    throw new Error(`expected the written event to reference #849, got:\n${written}`);
  }
  if (/^(title|created|updated):/m.test(written)) {
    throw new Error(`expected no assertion fields injected, got:\n${written}`);
  }
}

// endregion | Helpers
