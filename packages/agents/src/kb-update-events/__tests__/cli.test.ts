import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readNoteContent } from '@codeassembly/kb/note-io';
import { parseEvent } from '@codeassembly/kb/records';
import { describe, expect, it } from 'vitest';

import { parseArgs, runUpdate } from '../cli.ts';

const EVENT_ID = '01HZCEVENTAAAAAAAAAAAAAAAA';

/** Stand up a temp event store plus an isolated home that registers it under `name` and marks it `default_kb`. */
async function makeStore(name: string): Promise<{ storePath: string; home: string }> {
  const storePath = await mkdtemp(join(tmpdir(), 'update-events-store-'));
  await mkdir(join(storePath, '.kb'), { recursive: true });

  const home = await mkdtemp(join(tmpdir(), 'update-events-home-'));
  await mkdir(join(home, '.agents'), { recursive: true });
  await writeFile(
    join(home, '.agents', 'kb.yaml'),
    `default_kb: ${name}\nkbs:\n  ${name}:\n    path: ${storePath}\n`,
    'utf8',
  );

  return { storePath, home };
}

/** Write an event record under `content/events/{id}.md`, with optional extra frontmatter lines, returning its path. */
async function seedEvent(storePath: string, id: string, extraFields: string[] = []): Promise<string> {
  const dir = join(storePath, 'content', 'events');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.md`);
  const front = [
    'recordType: event',
    `id: ${id}`,
    'captured-at: 2026-06-18T09:41:02Z',
    'session: session-abc',
    'cwd: /tmp/work',
    'summary: Noticed a thing',
    ...extraFields,
  ];
  await writeFile(path, `---\n${front.join('\n')}\n---\n\nBody.\n`, 'utf8');
  return path;
}

/** Re-read a written event file and parse it back to a typed record, asserting it round-trips. */
async function readBackEvent(path: string): Promise<ReturnType<typeof parseEvent>> {
  const written = await readFile(path, 'utf8');
  const { fields, body } = readNoteContent(written);
  return parseEvent(fields, body);
}

describe(parseArgs, () => {
  it('parses an add-addressed-by invocation with a store and ids', () => {
    const parsed = parseArgs(['--store', 'codeassembly', '--add-addressed-by', '#849,#850', EVENT_ID]);
    expect(parsed).toEqual({
      operation: 'add-addressed-by',
      store: 'codeassembly',
      ids: [EVENT_ID],
      references: ['#849', '#850'],
    });
  });

  it('parses a retag invocation with multiple ids', () => {
    const parsed = parseArgs(['--store', 'codeassembly', '--retag', 'fix, observation', EVENT_ID, 'id-two']);
    expect(parsed).toEqual({
      operation: 'retag',
      store: 'codeassembly',
      ids: [EVENT_ID, 'id-two'],
      tags: ['fix', 'observation'],
    });
  });

  it('parses a set-impact invocation with multiple ids', () => {
    const parsed = parseArgs(['--store', 'codeassembly', '--set-impact', 'high', EVENT_ID, 'id-two']);
    expect(parsed).toEqual({
      operation: 'set-impact',
      store: 'codeassembly',
      ids: [EVENT_ID, 'id-two'],
      impact: 'high',
    });
  });

  it('accepts the inline --flag=value form', () => {
    const parsed = parseArgs(['--store=codeassembly', '--add-addressed-by=#849', EVENT_ID]);
    expect(parsed.store).toBe('codeassembly');
  });

  it('binds an inline =value verbatim even when it begins with --', () => {
    const parsed = parseArgs(['--store', 's', '--add-addressed-by=--weird-ref', EVENT_ID]);
    expect(parsed).toEqual({
      operation: 'add-addressed-by',
      store: 's',
      ids: [EVENT_ID],
      references: ['--weird-ref'],
    });
  });

  it('leaves store null when --store is omitted, deferring the refusal to the resolver', () => {
    const parsed = parseArgs(['--add-addressed-by', '#849', EVENT_ID]);
    expect(parsed.store).toBeNull();
  });

  it.each([
    { argv: ['--store', 's', EVENT_ID], pattern: /one operation flag is required/ },
    { argv: ['--store', 's', '--add-addressed-by', '#1', '--retag', 'fix', EVENT_ID], pattern: /mutually exclusive/ },
    {
      argv: ['--store', 's', '--add-addressed-by', '#1', '--set-impact', 'high', EVENT_ID],
      pattern: /mutually exclusive/,
    },
    { argv: ['--store', 's', '--set-impact', 'urgent', EVENT_ID], pattern: /--set-impact must be one of/ },
    { argv: ['--store', 's', '--add-addressed-by', '#1'], pattern: /at least one event id/ },
    { argv: ['--store', 's', '--add-addressed-by', '', EVENT_ID], pattern: /at least one reference/ },
    { argv: ['--store', 's', '--bogus', 'x', EVENT_ID], pattern: /unknown flag/ },
    { argv: ['--store', '--add-addressed-by', '#1', EVENT_ID], pattern: /--store requires a value/ },
  ])('throws on $pattern', ({ argv, pattern }) => {
    expect(() => parseArgs(argv)).toThrow(pattern);
  });
});

describe(runUpdate, () => {
  it('marks an event addressed-by a reference, injecting no assertion fields', async () => {
    const { storePath, home } = await makeStore('codeassembly');
    const path = await seedEvent(storePath, EVENT_ID);

    const result = await runUpdate({ argv: ['--store', 'codeassembly', '--add-addressed-by', '#849', EVENT_ID], home });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results).toEqual([{ ok: true, id: EVENT_ID, path }]);

    const written = await readFile(path, 'utf8');
    expect(written).not.toMatch(/^(title|created|updated):/m);

    const parsed = await readBackEvent(path);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.record.addressedBy).toEqual(['#849']);
  });

  it('de-duplicates addressed-by across existing and new entries', async () => {
    const { storePath, home } = await makeStore('codeassembly');
    const path = await seedEvent(storePath, EVENT_ID, ["addressed-by: ['#789']"]);

    const result = await runUpdate({
      argv: ['--store', 'codeassembly', '--add-addressed-by', '#789,#999', EVENT_ID],
      home,
    });

    expect(result.ok).toBe(true);
    const parsed = await readBackEvent(path);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.record.addressedBy).toEqual(['#789', '#999']);
  });

  it('retags an event, replacing its tags', async () => {
    const { storePath, home } = await makeStore('codeassembly');
    const path = await seedEvent(storePath, EVENT_ID, ['tags: [old]']);

    const result = await runUpdate({ argv: ['--store', 'codeassembly', '--retag', 'fix,observation', EVENT_ID], home });

    expect(result.ok).toBe(true);
    const parsed = await readBackEvent(path);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.record.tags).toEqual(['fix', 'observation']);
  });

  it('sets impact on a previously unrated event', async () => {
    const { storePath, home } = await makeStore('codeassembly');
    const path = await seedEvent(storePath, EVENT_ID);

    const result = await runUpdate({ argv: ['--store', 'codeassembly', '--set-impact', 'high', EVENT_ID], home });

    expect(result.ok).toBe(true);
    const parsed = await readBackEvent(path);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.record.impact).toBe('high');
  });

  it('replaces a prior impact value', async () => {
    const { storePath, home } = await makeStore('codeassembly');
    const path = await seedEvent(storePath, EVENT_ID, ['impact: low']);

    const result = await runUpdate({ argv: ['--store', 'codeassembly', '--set-impact', 'critical', EVENT_ID], home });

    expect(result.ok).toBe(true);
    const parsed = await readBackEvent(path);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.record.impact).toBe('critical');
  });

  it('reports per-event success and failure across a mixed batch', async () => {
    const { storePath, home } = await makeStore('codeassembly');
    const goodPath = await seedEvent(storePath, EVENT_ID);
    const missingId = '01HZCEVENTBBBBBBBBBBBBBBBB';

    const result = await runUpdate({
      argv: ['--store', 'codeassembly', '--add-addressed-by', '#849', EVENT_ID, missingId],
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({ ok: true, id: EVENT_ID, path: goodPath });
    expect(result.results[1]?.ok).toBe(false);
    const failure = result.results[1];
    if (failure === undefined || failure.ok) return;
    expect(failure.error).toBe('not-found');

    const parsed = await readBackEvent(goodPath);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.record.addressedBy).toEqual(['#849']);
  });

  it('rejects an id containing a path separator as invalid-id', async () => {
    const { home } = await makeStore('codeassembly');

    const result = await runUpdate({
      argv: ['--store', 'codeassembly', '--add-addressed-by', '#849', '../escape'],
      home,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results[0]?.ok).toBe(false);
    const failure = result.results[0];
    if (failure === undefined || failure.ok) return;
    expect(failure.error).toBe('invalid-id');
  });

  it('returns missing-store when --store is omitted', async () => {
    const { home } = await makeStore('codeassembly');

    const result = await runUpdate({ argv: ['--add-addressed-by', '#849', EVENT_ID], home });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('missing-store');
  });

  it('returns store-not-registered for an unknown store', async () => {
    const { home } = await makeStore('codeassembly');

    const result = await runUpdate({ argv: ['--store', 'ghost', '--add-addressed-by', '#849', EVENT_ID], home });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('store-not-registered');
  });

  it('writes an edited event that still validates as an event record', async () => {
    const { storePath, home } = await makeStore('codeassembly');
    const path = await seedEvent(storePath, EVENT_ID);

    const result = await runUpdate({ argv: ['--store', 'codeassembly', '--add-addressed-by', '#849', EVENT_ID], home });
    expect(result.ok).toBe(true);

    const written = await readFile(path, 'utf8');
    const { fields, body } = readNoteContent(written);
    expect(parseEvent(fields, body).ok).toBe(true);
  });
});
