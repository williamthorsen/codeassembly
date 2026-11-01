import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { resolveEventPath, resolveEventsDir, resolveKbDir } from '@williamthorsen/kb/layout';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Builds an event store containing one feedback event and an isolated home registering it as `feedback_kb`, then
 * returns an invocation that inventories the store with `--store @feedback`. Exercises the `@feedback` resolution →
 * read → parse → filter → write pipeline.
 */
export function makeLessonClustersSmokeTest(): SmokeTestInvocation {
  const storePath = mkdtempSync(path.join(tmpdir(), 'lesson-clusters-store-'));
  mkdirSync(resolveKbDir(storePath), { recursive: true });
  mkdirSync(resolveEventsDir(storePath), { recursive: true });
  writeFileSync(
    resolveEventPath({ storePath, id: 'smoke-event' }),
    [
      '---',
      'recordType: event',
      'id: smoke-event',
      'captured-at: 2026-06-18T09:41:02Z',
      'cwd: /tmp/smoke',
      'summary: Smoke event',
      'tags: [feedback]',
      '---',
      '',
      'Body.',
      '',
    ].join('\n'),
    'utf8',
  );

  const home = mkdtempSync(path.join(tmpdir(), 'lesson-clusters-home-'));
  mkdirSync(path.join(home, '.agents'), { recursive: true });
  writeFileSync(
    path.join(home, '.agents', 'kb.yaml'),
    `feedback_kb: codeassembly\nkbs:\n  codeassembly:\n    path: ${storePath}\n`,
    'utf8',
  );

  const out = path.join(home, 'inventory.json');
  return {
    args: ['inventory', '--store', '@feedback', '--out', out],
    env: { ...process.env, HOME: home },
    assertResult: (result) => assertLessonClustersSmokeResult(result, out),
  };
}

// region | Helpers

/** Asserts that the inventory reports the one feedback event in its pool and wrote it to the output file. */
function assertLessonClustersSmokeResult(result: unknown, out: string): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from lesson-clusters');
  }
  if (result['ok'] !== true || result['pool'] !== 1 || result['deferred'] !== 0) {
    throw new Error(`expected ok: true with one pool event, got ${JSON.stringify(result)}`);
  }
  const written = readFileSync(out, 'utf8');
  if (!written.includes('"smoke-event"')) {
    throw new Error(`expected the inventory to contain smoke-event, got:\n${written}`);
  }
}

// endregion | Helpers
