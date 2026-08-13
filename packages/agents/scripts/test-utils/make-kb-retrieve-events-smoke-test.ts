import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { resolveKbDir } from '@williamthorsen/kb/layout';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Stands up an event store plus an isolated home registering it, then returns a `SmokeTestInvocation` that scopes to a
 * store name the registry does not carry. Exercises the bundled resolver from home discovery through registry parse to
 * the scope verdict and the JSON result shape, stopping short of recall.
 *
 * Keep the invocation off the recall path: recalling here would put ripgrep on the critical path of every build.
 */
export function makeKbRetrieveEventsSmokeTest(): SmokeTestInvocation {
  const storePath = mkdtempSync(path.join(tmpdir(), 'kb-retrieve-events-store-'));
  mkdirSync(resolveKbDir(storePath), { recursive: true });

  const home = mkdtempSync(path.join(tmpdir(), 'kb-retrieve-events-home-'));
  mkdirSync(path.join(home, '.agents'), { recursive: true });
  writeFileSync(
    path.join(home, '.agents', 'kb.yaml'),
    `default_kb: codeassembly\nkbs:\n  codeassembly:\n    path: ${storePath}\n`,
    'utf8',
  );

  return {
    args: ['retrievesmokequux', '--store', 'no-such-store'],
    env: { ...process.env, HOME: home },
    assertResult: assertKbRetrieveEventsSmokeResult,
  };
}

// region | Helpers

/** Assert the kb-retrieve-events smoke resolved the registry and reported the requested store as unregistered. */
function assertKbRetrieveEventsSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from kb-retrieve-events');
  }
  if (!Array.isArray(result.candidates) || result.candidates.length > 0) {
    throw new Error(`expected an empty candidate table, got ${JSON.stringify(result)}`);
  }
  if (!Array.isArray(result.scopedKbs) || result.scopedKbs.length > 0) {
    throw new Error(`expected an empty scope, got ${JSON.stringify(result.scopedKbs)}`);
  }
  if (typeof result.diagnostic !== 'string' || !result.diagnostic.includes('is not registered in kb.yaml')) {
    throw new Error(`expected an unregistered-store diagnostic, got ${JSON.stringify(result.diagnostic)}`);
  }
}

// endregion | Helpers
