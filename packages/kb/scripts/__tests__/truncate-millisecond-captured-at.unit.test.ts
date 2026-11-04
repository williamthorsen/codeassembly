import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { makeStore } from '../../src/test-utils/make-store.ts';
import { makeRegistryPath, seedRegistry } from '../../src/test-utils/registry.ts';
import { migrateStore, truncateMillisecondCapturedAt } from '../truncate-millisecond-captured-at.ts';

const MILLISECOND_EVENT = `---
recordType: event
id: 01KTNY0B7RTYMH8M8GZ1MJJ0C2
captured-at: 2026-06-09T10:14:16.009Z
session: ''
cwd: /tmp/work
summary: An event
tags: [a, b]
---

Body that mentions captured-at: 2026-06-09T10:14:16.009Z verbatim.
`;

describe(truncateMillisecondCapturedAt, () => {
  it('truncates a millisecond captured-at and leaves every other byte unchanged', () => {
    const result = truncateMillisecondCapturedAt(MILLISECOND_EVENT);

    expect(result).toStrictEqual({
      content: MILLISECOND_EVENT.replace(
        'captured-at: 2026-06-09T10:14:16.009Z\n',
        'captured-at: 2026-06-09T10:14:16Z\n',
      ),
      before: '2026-06-09T10:14:16.009Z',
      after: '2026-06-09T10:14:16Z',
    });
  });

  it.each([
    ['a second-precision value', MILLISECOND_EVENT.replace('16.009Z\nsession', '16Z\nsession')],
    ['a date-only value', MILLISECOND_EVENT.replace('2026-06-09T10:14:16.009Z\nsession', '2026-06-09\nsession')],
    ['a non-event note', MILLISECOND_EVENT.replace('recordType: event', 'recordType: assertion')],
    ['a note without frontmatter', 'captured-at: 2026-06-09T10:14:16.009Z\n'],
  ])('returns undefined for %s', (_label, content) => {
    expect(truncateMillisecondCapturedAt(content)).toBeUndefined();
  });

  it('does not rewrite a captured-at-shaped line in the body', () => {
    const result = truncateMillisecondCapturedAt(MILLISECOND_EVENT);

    expect(result?.content).toContain('Body that mentions captured-at: 2026-06-09T10:14:16.009Z verbatim.');
  });
});

describe(migrateStore, () => {
  it('reports the changes and writes nothing without write', async () => {
    const { home, storePath } = await makeRegisteredStore({ readonly: false });

    const outcome = await migrateStore({ kb: 'events', write: false, cwd: storePath, home });

    expect(outcome).toStrictEqual({
      ok: true,
      storePath,
      changes: [
        {
          path: join('content', 'events', 'ms.md'),
          before: '2026-06-09T10:14:16.009Z',
          after: '2026-06-09T10:14:16Z',
        },
      ],
    });
    expect(await readFile(join(storePath, 'content', 'events', 'ms.md'), 'utf8')).toBe(MILLISECOND_EVENT);
  });

  it('writes the changes under write, and a second run changes nothing', async () => {
    const { home, storePath } = await makeRegisteredStore({ readonly: false });

    await migrateStore({ kb: 'events', write: true, cwd: storePath, home });
    const rerun = await migrateStore({ kb: 'events', write: true, cwd: storePath, home });

    expect(await readFile(join(storePath, 'content', 'events', 'ms.md'), 'utf8')).toContain(
      'captured-at: 2026-06-09T10:14:16Z\n',
    );
    expect(rerun).toStrictEqual({ ok: true, storePath, changes: [] });
  });

  it('refuses to write into a readonly store', async () => {
    const { home, storePath } = await makeRegisteredStore({ readonly: true });

    const outcome = await migrateStore({ kb: 'events', write: true, cwd: storePath, home });

    expect(outcome.ok).toBe(false);
    expect(await readFile(join(storePath, 'content', 'events', 'ms.md'), 'utf8')).toBe(MILLISECOND_EVENT);
  });

  it('fails on a store name that the registry does not contain', async () => {
    const { home, storePath } = await makeRegisteredStore({ readonly: false });

    const outcome = await migrateStore({ kb: 'missing', write: false, cwd: storePath, home });

    expect(outcome.ok).toBe(false);
  });
});

// region | Helpers

/** Creates a store containing one millisecond event and one second-precision event, registered as `events`. */
async function makeRegisteredStore(input: { readonly: boolean }): Promise<{ home: string; storePath: string }> {
  const storePath = await makeStore({
    'content/events/ms.md': MILLISECOND_EVENT,
    'content/events/seconds.md': MILLISECOND_EVENT.replace('16.009Z\nsession', '16Z\nsession'),
  });
  const registryPath = await makeRegistryPath();
  await seedRegistry(
    registryPath,
    `kbs:\n  events:\n    path: ${storePath}\n${input.readonly ? '    readonly: true\n' : ''}`,
  );
  return { home: dirname(dirname(registryPath)), storePath };
}

// endregion | Helpers
