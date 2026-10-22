import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runIndexPrototypes } from '../cli.ts';
import { COPY_PROBE_SCRIPT } from '../copy-probe.ts';
import { buildPng } from '../test-utils/build-png.ts';

const NOW = new Date('2026-10-03T01:19:36.000Z');

const LATER = new Date('2026-10-03T02:00:00.000Z');

describe(runIndexPrototypes, () => {
  it('returns invalid-args for a defective invocation', async () => {
    await expect(runIndexPrototypes({ argv: [], now: NOW })).resolves.toMatchObject({
      ok: false,
      error: 'invalid-args',
    });
  });

  it('prints the copy probe without a set directory', async () => {
    await expect(runIndexPrototypes({ argv: ['copy-probe'], now: NOW })).resolves.toEqual({
      ok: true,
      command: 'copy-probe',
      function: COPY_PROBE_SCRIPT,
    });
  });

  it('creates the manifest on the first registration', async () => {
    const setDir = await makeSetDir();

    const result = await runIndexPrototypes({
      argv: [
        'register',
        '--set-dir',
        setDir,
        '--set-title',
        'Header variants',
        '--slug',
        'dense',
        '--title',
        'Dense header',
        '--url',
        'https://claude.ai/artifact/dense',
        '--source',
        path.join(setDir, 'dense-v1.html'),
        '--lens',
        'information density',
        '--inputs',
        'ticket, sketch ,',
        '--description',
        'Packs the toolbar into one row.',
      ],
      now: NOW,
    });

    expect(result).toEqual({
      ok: true,
      command: 'register',
      manifestPath: path.join(setDir, 'manifest.json'),
      entry: {
        slug: 'dense',
        number: 1,
        version: 1,
        registeredAt: '2026-10-03T01:19:36.000Z',
        title: 'Dense header',
        url: 'https://claude.ai/artifact/dense',
        source: path.join(setDir, 'dense-v1.html'),
        lens: 'information density',
        inputs: ['ticket', 'sketch'],
        description: 'Packs the toolbar into one row.',
        notes: [],
        shot: null,
      },
    });
    expect(await readManifestFile(setDir)).toMatchObject({ title: 'Header variants', indexUrl: null });
  });

  it('increments the version when a slug is re-registered and keeps the earlier entry', async () => {
    const setDir = await makeSetDir();
    await register(setDir, 'dense', NOW, ['--set-title', 'Set']);

    const result = await register(setDir, 'dense', LATER, ['--title', 'Dense header, revised']);

    expect(result).toMatchObject({ ok: true, entry: { version: 2, registeredAt: LATER.toISOString() } });
    const manifest = await readManifestFile(setDir);
    expect(manifest).toMatchObject({
      title: 'Set',
      entries: [
        { slug: 'dense', version: 1 },
        { slug: 'dense', version: 2, title: 'Dense header, revised' },
      ],
    });
  });

  it('numbers each new slug in registration order and keeps the number across versions', async () => {
    const setDir = await makeSetDir();
    await register(setDir, 'dense', NOW, ['--set-title', 'Set']);
    await register(setDir, 'airy', NOW, []);

    const result = await register(setDir, 'dense', LATER, []);

    expect(result).toMatchObject({ ok: true, entry: { slug: 'dense', number: 1, version: 2 } });
    expect(await readManifestFile(setDir)).toMatchObject({
      entries: [
        { slug: 'dense', number: 1 },
        { slug: 'airy', number: 2 },
        { slug: 'dense', number: 1 },
      ],
    });
  });

  it('takes a requested number for a new slug and keeps it on a later registration', async () => {
    const setDir = await makeSetDir();
    await register(setDir, 'dense', NOW, ['--set-title', 'Set']);

    await register(setDir, 'bold', NOW, ['--number', '3']);
    const result = await register(setDir, 'bold', LATER, ['--number', '3']);

    expect(result).toMatchObject({ ok: true, entry: { slug: 'bold', number: 3, version: 2 } });
  });

  it.each<[string, string, RegExp]>([
    ['dense', '2', /slug "dense" is number 1, not 2/],
    ['bold', '1', /number 1 belongs to slug "dense"/],
    ['bold', '0', /must be a positive integer/],
    ['bold', 'x', /must be a positive integer/],
  ])('refuses --number %s for slug %s', async (slug, number, message) => {
    const setDir = await makeSetDir();
    await register(setDir, 'dense', NOW, ['--set-title', 'Set']);

    const result = await register(setDir, slug, LATER, ['--number', number]);

    expect(result).toMatchObject({ ok: false, error: 'number-conflict' });
    expect(result).toHaveProperty('message', expect.stringMatching(message));
    expect(await readManifestFile(setDir)).toMatchObject({ entries: [{ slug: 'dense', number: 1 }] });
  });

  it('resolves the ids that registering the slugs in order would assign, without writing', async () => {
    const setDir = await makeSetDir();
    await register(setDir, 'dense', NOW, ['--set-title', 'Set']);
    await register(setDir, 'airy', NOW, []);

    const result = await runIndexPrototypes({
      argv: ['resolve-ids', '--set-dir', setDir, '--slugs', 'airy, bold'],
      now: LATER,
    });

    expect(result).toEqual({
      ok: true,
      command: 'resolve-ids',
      ids: [
        { slug: 'airy', number: 2, version: 2, id: '2.2' },
        { slug: 'bold', number: 3, version: 1, id: '3.1' },
      ],
    });
    expect(await readManifestFile(setDir)).toMatchObject({ entries: [{ slug: 'dense' }, { slug: 'airy' }] });
  });

  it('resolves ids for a set that does not have a manifest yet', async () => {
    const setDir = await makeSetDir();

    await expect(
      runIndexPrototypes({ argv: ['resolve-ids', '--set-dir', setDir, '--slugs', 'a,b'], now: NOW }),
    ).resolves.toMatchObject({ ok: true, ids: [{ id: '1.1' }, { id: '2.1' }] });
  });

  it.each([
    ['Upper', 'invalid-slug'],
    ['a,a', 'invalid-args'],
    [' , ', 'invalid-args'],
  ])('refuses resolve-ids --slugs %j', async (slugs, error) => {
    const setDir = await makeSetDir();

    await expect(
      runIndexPrototypes({ argv: ['resolve-ids', '--set-dir', setDir, '--slugs', slugs], now: NOW }),
    ).resolves.toMatchObject({ ok: false, error });
  });

  it('writes numbers into a manifest that lacks them at the next registration', async () => {
    const setDir = await makeSetDir();
    await register(setDir, 'dense', NOW, ['--set-title', 'Set']);
    await register(setDir, 'airy', NOW, []);
    await stripManifestNumbers(setDir);

    await register(setDir, 'bold', NOW, []);

    expect(await readManifestFile(setDir)).toMatchObject({
      entries: [
        { slug: 'dense', number: 1 },
        { slug: 'airy', number: 2 },
        { slug: 'bold', number: 3 },
      ],
    });
  });

  it('stores the notes on the entry in the order given', async () => {
    const setDir = await makeSetDir();

    const result = await register(setDir, 'a', NOW, [
      '--set-title',
      'Set',
      '--note',
      'Search: Top bar',
      '--note',
      'Home: Recent items',
    ]);

    expect(result).toMatchObject({
      ok: true,
      entry: {
        notes: [
          { label: 'Search', value: 'Top bar' },
          { label: 'Home', value: 'Recent items' },
        ],
      },
    });
  });

  it('refuses a malformed note without writing', async () => {
    const setDir = await makeSetDir();

    const result = await register(setDir, 'a', NOW, ['--set-title', 'Set', '--note', 'Search']);

    expect(result).toMatchObject({ ok: false, error: 'invalid-args' });
    await expect(readFile(path.join(setDir, 'manifest.json'), 'utf8')).rejects.toThrow(/ENOENT/);
  });

  it('keeps the set summary across a later registration', async () => {
    const setDir = await makeSetDir();
    await register(setDir, 'a', NOW, ['--set-title', 'Set']);
    const summary = { shared: 'Same data.', changes: null, try: ['Search for a title.'] };
    await describeSet(setDir, summary);

    await register(setDir, 'b', NOW, []);

    expect(await readManifestFile(setDir)).toMatchObject({ summary });
  });

  it('replaces the set title when a later registration gives one', async () => {
    const setDir = await makeSetDir();
    await register(setDir, 'a', NOW, ['--set-title', 'First']);

    await register(setDir, 'b', NOW, ['--set-title', 'Second']);

    expect(await readManifestFile(setDir)).toMatchObject({ title: 'Second' });
  });

  it('refuses the first registration without a set title', async () => {
    const setDir = await makeSetDir();

    await expect(register(setDir, 'a', NOW, [])).resolves.toMatchObject({ ok: false, error: 'missing-set-title' });
  });

  it('refuses an invalid slug without writing', async () => {
    const setDir = await makeSetDir();

    await expect(register(setDir, 'Bad_Slug', NOW, ['--set-title', 'Set'])).resolves.toMatchObject({
      ok: false,
      error: 'invalid-slug',
    });
    await expect(readFile(path.join(setDir, 'manifest.json'), 'utf8')).rejects.toThrow(/ENOENT/);
  });

  it('refuses a URL that is not http or https', async () => {
    const setDir = await makeSetDir();

    const result = await runIndexPrototypes({
      argv: [
        'register',
        '--set-dir',
        setDir,
        '--set-title',
        'S',
        '--slug',
        'a',
        '--title',
        'A',
        '--url',
        'javascript:x',
      ],
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid-url' });
  });

  it("stores a screenshot under the registration's version and records it on the entry", async () => {
    const setDir = await makeSetDir();
    const capture = path.join(setDir, 'capture.png');
    const png = buildPng(1_280, 2);
    await writeFile(capture, png);
    await register(setDir, 'a', NOW, ['--set-title', 'Set']);

    const result = await register(setDir, 'a', LATER, ['--screenshot', capture]);

    expect(result).toMatchObject({ ok: true, entry: { version: 2, shot: path.join('shots', 'a-v2.png') } });
    expect(await readFile(path.join(setDir, 'shots', 'a-v2.png'))).toEqual(png);
  });

  it('refuses a screenshot that is not a PNG without writing the manifest', async () => {
    const setDir = await makeSetDir();
    const capture = path.join(setDir, 'capture.jpg');
    await writeFile(capture, 'not a png at all, but long enough');

    const result = await runIndexPrototypes({
      argv: [
        'register',
        '--set-dir',
        setDir,
        '--set-title',
        'S',
        '--slug',
        'a',
        '--title',
        'A',
        '--url',
        'https://x.test/a',
        '--screenshot',
        capture,
      ],
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, error: 'not-png' });
    await expect(readFile(path.join(setDir, 'manifest.json'), 'utf8')).rejects.toThrow(/ENOENT/);
  });

  it('records the index URL in the manifest', async () => {
    const setDir = await makeSetDir();
    await register(setDir, 'a', NOW, ['--set-title', 'Set']);

    const result = await runIndexPrototypes({
      argv: ['record-index', '--set-dir', setDir, '--url', 'https://claude.ai/artifact/index'],
      now: NOW,
    });

    expect(result).toMatchObject({ ok: true, command: 'record-index', indexUrl: 'https://claude.ai/artifact/index' });
    expect(await readManifestFile(setDir)).toMatchObject({ indexUrl: 'https://claude.ai/artifact/index' });
  });

  it('keeps the recorded index URL across a later registration', async () => {
    const setDir = await makeSetDir();
    await register(setDir, 'a', NOW, ['--set-title', 'Set']);
    await runIndexPrototypes({
      argv: ['record-index', '--set-dir', setDir, '--url', 'https://claude.ai/artifact/index'],
      now: NOW,
    });

    await register(setDir, 'b', LATER, []);

    expect(await readManifestFile(setDir)).toMatchObject({ indexUrl: 'https://claude.ai/artifact/index' });
  });

  it('stores a trimmed summary and replaces an earlier one', async () => {
    const setDir = await makeSetDir();
    await register(setDir, 'a', NOW, ['--set-title', 'Set']);
    await describeSet(setDir, { shared: 'First.', changes: null, try: [] });

    const result = await describeSet(setDir, {
      shared: ' Same data. ',
      changes: ' Search moved. ',
      try: [' Search. '],
    });

    const summary = { shared: 'Same data.', changes: 'Search moved.', try: ['Search.'] };
    expect(result).toEqual({
      ok: true,
      command: 'describe-set',
      manifestPath: path.join(setDir, 'manifest.json'),
      summary,
    });
    expect(await readManifestFile(setDir)).toMatchObject({ title: 'Set', summary, entries: [{ slug: 'a' }] });
  });

  it.each([
    ['an absent changes', { shared: 'S', try: [] }],
    ['a blank changes', { shared: 'S', changes: '  ', try: [] }],
  ])('stores %s as null', async (_case, input) => {
    const setDir = await makeSetDir();
    await register(setDir, 'a', NOW, ['--set-title', 'Set']);

    const result = await describeSet(setDir, input);

    expect(result).toMatchObject({ ok: true, summary: { shared: 'S', changes: null, try: [] } });
  });

  it.each([
    ['a list', []],
    ['a blank shared', { shared: ' ', changes: null, try: [] }],
    ['a numeric changes', { shared: 'S', changes: 1, try: [] }],
    ['a blank try item', { shared: 'S', changes: null, try: ['ok', ''] }],
    ['a missing try', { shared: 'S', changes: null }],
  ])('refuses %s without writing', async (_case, input) => {
    const setDir = await makeSetDir();
    await register(setDir, 'a', NOW, ['--set-title', 'Set']);
    const before = await readManifestFile(setDir);

    const result = await describeSet(setDir, input);

    expect(result).toMatchObject({ ok: false, error: 'invalid-summary' });
    expect(await readManifestFile(setDir)).toEqual(before);
  });

  it('refuses a summary file that is not JSON', async () => {
    const setDir = await makeSetDir();
    await register(setDir, 'a', NOW, ['--set-title', 'Set']);
    const filePath = path.join(setDir, 'summary.json');
    await writeFile(filePath, '{', 'utf8');

    const result = await runIndexPrototypes({
      argv: ['describe-set', '--set-dir', setDir, '--file', filePath],
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, error: 'invalid-summary' });
  });

  it('refuses a summary file that does not exist', async () => {
    const setDir = await makeSetDir();
    await register(setDir, 'a', NOW, ['--set-title', 'Set']);

    const result = await runIndexPrototypes({
      argv: ['describe-set', '--set-dir', setDir, '--file', path.join(setDir, 'absent.json')],
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, error: 'summary-not-found' });
  });

  it('refuses describe-set before any registration', async () => {
    const setDir = await makeSetDir();

    const result = await describeSet(setDir, { shared: 'S', changes: null, try: [] });

    expect(result).toMatchObject({ ok: false, error: 'manifest-not-found' });
  });

  it('refuses record-index before any registration', async () => {
    const setDir = await makeSetDir();

    const result = await runIndexPrototypes({
      argv: ['record-index', '--set-dir', setDir, '--url', 'https://claude.ai/artifact/index'],
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, error: 'manifest-not-found' });
  });
});

// region | Helpers

/** Writes `summary` as a JSON file beside the set and runs `describe-set` on it. */
async function describeSet(setDir: string, summary: unknown) {
  const filePath = path.join(setDir, 'summary.json');
  await writeFile(filePath, JSON.stringify(summary), 'utf8');
  return runIndexPrototypes({ argv: ['describe-set', '--set-dir', setDir, '--file', filePath], now: NOW });
}

/** Creates an empty set directory. */
async function makeSetDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'index-prototypes-cli-'));
}

/** Reads the set's manifest file as parsed JSON. */
async function readManifestFile(setDir: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(setDir, 'manifest.json'), 'utf8'));
}

/** Rewrites the set's manifest without entry numbers, as a manifest written before numbers existed stores it. */
async function stripManifestNumbers(setDir: string): Promise<void> {
  const manifestPath = path.join(setDir, 'manifest.json');
  const text = await readFile(manifestPath, 'utf8');
  await writeFile(manifestPath, text.replaceAll(/\n\s*"number": \d+,/g, ''), 'utf8');
}

/** Registers `slug` with fixed title and URL, adding `extra` flags. */
async function register(setDir: string, slug: string, now: Date, extra: string[]) {
  return runIndexPrototypes({
    argv: [
      'register',
      '--set-dir',
      setDir,
      '--slug',
      slug,
      '--title',
      `Prototype ${slug}`,
      '--url',
      'https://claude.ai/artifact/x',
      ...extra,
    ],
    now,
  });
}

// endregion | Helpers
