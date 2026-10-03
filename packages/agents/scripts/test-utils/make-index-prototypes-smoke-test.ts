import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Builds a set directory whose manifest registers one prototype without a screenshot, then returns an invocation that
 * renders its index page. Exercises the manifest read → page render → write pipeline.
 */
export function makeIndexPrototypesSmokeTest(): SmokeTestInvocation {
  const setDir = mkdtempSync(path.join(tmpdir(), 'index-prototypes-smoke-'));
  writeFileSync(
    path.join(setDir, 'manifest.json'),
    JSON.stringify({
      title: 'Smoke set',
      indexUrl: null,
      entries: [
        {
          slug: 'smoke',
          version: 1,
          registeredAt: '2026-10-03T01:00:00.000Z',
          title: 'Smoke prototype',
          url: 'https://claude.ai/artifact/smoke',
          source: null,
          lens: null,
          inputs: [],
          description: null,
          shot: null,
        },
      ],
    }),
    'utf8',
  );
  return {
    args: ['render', '--set-dir', setDir, '--out', path.join(setDir, 'index.html')],
    assertResult: assertIndexPrototypesSmokeResult,
  };
}

// region | Helpers

/** Asserts that the render produced an ok result for one card. */
function assertIndexPrototypesSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from index-prototypes');
  }
  if (result.ok !== true || result.command !== 'render' || result.cards !== 1) {
    throw new Error(`expected an ok render of one card, got ${JSON.stringify(result)}`);
  }
}

// endregion | Helpers
