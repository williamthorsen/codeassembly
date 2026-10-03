import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArgs, runIndexPrototypes } from '../cli.ts';
import type { CommandRunner } from '../intake-screenshot.ts';
import { buildPng } from '../test-utils/build-png.ts';

const NOW = new Date('2026-10-03T01:19:36.000Z');

const LATER = new Date('2026-10-03T02:00:00.000Z');

describe(parseArgs, () => {
  it('parses a command and its flags', () => {
    expect(parseArgs(['record-index', '--set-dir', '/s', '--url=https://x.test/a'])).toEqual({
      command: 'record-index',
      values: { 'set-dir': '/s', url: 'https://x.test/a' },
    });
  });

  it('refuses a missing command', () => {
    expect(() => parseArgs(['--set-dir', '/s'])).toThrow(/a command is required/);
  });

  it('refuses an unknown command', () => {
    expect(() => parseArgs(['publish'])).toThrow(/unknown command "publish"/);
  });

  it('refuses a flag that the command does not take', () => {
    expect(() => parseArgs(['record-index', '--set-dir', '/s', '--url', 'u', '--slug', 'a'])).toThrow(
      /record-index does not take --slug/,
    );
  });

  it('refuses a missing required flag', () => {
    expect(() => parseArgs(['record-index', '--set-dir', '/s'])).toThrow(/requires --url/);
  });

  it('refuses an empty value', () => {
    expect(() => parseArgs(['record-index', '--set-dir=', '--url', 'u'])).toThrow(/--set-dir requires a value/);
  });
});

describe(runIndexPrototypes, () => {
  it('returns invalid-args for a defective invocation', async () => {
    await expect(runIndexPrototypes({ argv: [], now: NOW })).resolves.toMatchObject({
      ok: false,
      error: 'invalid-args',
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
        version: 1,
        registeredAt: '2026-10-03T01:19:36.000Z',
        title: 'Dense header',
        url: 'https://claude.ai/artifact/dense',
        source: path.join(setDir, 'dense-v1.html'),
        lens: 'information density',
        inputs: ['ticket', 'sketch'],
        description: 'Packs the toolbar into one row.',
        shot: null,
        downsized: false,
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
    await writeFile(capture, buildPng(1_280, 2));
    const runner: CommandRunner = async (argv) => {
      await writeFile(argv[4] ?? '', buildPng(640, 1));
      return { status: 0, stderr: '' };
    };
    await register(setDir, 'a', NOW, ['--set-title', 'Set']);

    const result = await runIndexPrototypes({
      argv: [
        'register',
        '--set-dir',
        setDir,
        '--slug',
        'a',
        '--title',
        'A',
        '--url',
        'https://x.test/a',
        '--screenshot',
        capture,
      ],
      now: LATER,
      runner,
    });

    expect(result).toMatchObject({
      ok: true,
      entry: { version: 2, shot: path.join('shots', 'a-v2.png'), downsized: true },
    });
    expect(result).not.toHaveProperty('warning');
  });

  it('reports the intake warning on the result', async () => {
    const setDir = await makeSetDir();
    const capture = path.join(setDir, 'capture.png');
    await writeFile(capture, buildPng(1_280, 2));
    const runner: CommandRunner = () => Promise.resolve({ status: null, stderr: '' });

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
      runner,
    });

    expect(result).toMatchObject({ ok: true, entry: { downsized: false }, warning: expect.stringMatching(/sips/) });
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

/** Creates an empty set directory. */
async function makeSetDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'index-prototypes-cli-'));
}

/** Reads the set's manifest file as parsed JSON. */
async function readManifestFile(setDir: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(setDir, 'manifest.json'), 'utf8'));
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
