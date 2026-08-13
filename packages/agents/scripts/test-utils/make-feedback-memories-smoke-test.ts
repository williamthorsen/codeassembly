import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { isRecord } from './is-record.ts';
import type { SmokeTestInvocation } from './smoke-test-invocation.ts';

/**
 * Stands up an isolated home holding one nested-schema feedback memory under a memory store, then returns a
 * `SmokeTestInvocation` that runs `enumerate` against it. `HOME` points the projects-root walk at the fixture and an
 * empty `CLAUDE_CONFIG_DIR` neutralizes any ambient value, so the enumeration never touches the developer's real
 * `~/.claude`. Exercises the full projects-root resolution → store walk → frontmatter parse → feedback filter pipeline.
 */
export function makeFeedbackMemoriesSmokeTest(): SmokeTestInvocation {
  const home = mkdtempSync(path.join(tmpdir(), 'feedback-memories-home-'));
  const memoryDir = path.join(home, '.claude', 'projects', '-store-smoke', 'memory');
  mkdirSync(memoryDir, { recursive: true });
  writeFileSync(
    path.join(memoryDir, 'feedback-smoke-example.md'),
    [
      '---',
      'name: feedback-smoke-example',
      'description: a smoke-test feedback memory',
      'metadata:',
      '  node_type: memory',
      '  type: feedback',
      '  originSessionId: smoke-session',
      '---',
      '',
      'Smoke body.',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    path.join(memoryDir, 'MEMORY.md'),
    '# Memory\n\n## Feedback\n\n- [x](feedback-smoke-example.md): x\n',
    'utf8',
  );

  return {
    args: ['enumerate'],
    env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: '' },
    assertResult: assertFeedbackMemoriesSmokeResult,
  };
}

// region | Helpers

/**
 * Assert the feedback-memories smoke enumerated exactly the seeded feedback memory, reading its slug and the
 * origin session id from the nested `metadata` schema.
 */
function assertFeedbackMemoriesSmokeResult(result: unknown): void {
  if (!isRecord(result)) {
    throw new TypeError('expected object result from feedback-memories');
  }
  if (result.ok !== true) {
    throw new Error(`expected ok: true, got ${JSON.stringify(result)}`);
  }
  if (!Array.isArray(result.memories) || result.memories.length !== 1) {
    throw new Error(`expected exactly one enumerated memory, got ${JSON.stringify(result.memories)}`);
  }
  const memory: unknown = result.memories[0];
  if (!isRecord(memory) || memory.slug !== 'feedback-smoke-example') {
    throw new Error(`expected the seeded feedback memory, got ${JSON.stringify(memory)}`);
  }
  if (memory.originSessionId !== 'smoke-session') {
    throw new Error(`expected originSessionId from nested metadata, got ${JSON.stringify(memory.originSessionId)}`);
  }
}

// endregion | Helpers
