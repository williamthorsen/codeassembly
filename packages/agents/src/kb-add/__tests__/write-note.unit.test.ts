import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { KbAssertion } from '@williamthorsen/kb/records';
import { beforeEach, describe, expect, it } from 'vitest';

import { composeFilename, writeNote } from '../write-note.ts';

/** Builds a baseline assertion record for the writer under test, with overrides merged in. */
function buildRecord(overrides: Partial<KbAssertion> = {}): KbAssertion {
  return {
    recordType: 'assertion',
    title: 'Sample',
    created: '2026-05-24T09:14:22Z',
    updated: '2026-05-24T13:58:12Z',
    tags: ['sample'],
    addressedBy: [],
    extra: {},
    body: '',
    ...overrides,
  };
}

describe(composeFilename, () => {
  it('appends .md to a trimmed title', () => {
    expect(composeFilename('  Working with Node streams  ')).toEqual({
      ok: true,
      filename: 'Working with Node streams.md',
    });
  });

  it('rejects an empty title', () => {
    expect(composeFilename(' '.repeat(3))).toMatchObject({ ok: false, reason: 'invalid-title' });
  });

  it('rejects a title containing a forward slash', () => {
    expect(composeFilename('foo/bar')).toMatchObject({ ok: false, reason: 'invalid-title' });
  });

  it('rejects a title containing a backslash', () => {
    expect(composeFilename(String.raw`foo\bar`)).toMatchObject({ ok: false, reason: 'invalid-title' });
  });

  it('rejects a title containing a null byte', () => {
    expect(composeFilename('foo\0bar')).toMatchObject({ ok: false, reason: 'invalid-title' });
  });

  it('rejects a title containing a newline', () => {
    expect(composeFilename('foo\nbar')).toMatchObject({ ok: false, reason: 'invalid-title' });
  });

  it('rejects a title containing a carriage return', () => {
    expect(composeFilename('foo\rbar')).toMatchObject({ ok: false, reason: 'invalid-title' });
  });

  it('rejects a literal . or .. title', () => {
    expect(composeFilename('.')).toMatchObject({ ok: false, reason: 'invalid-title' });
    expect(composeFilename('..')).toMatchObject({ ok: false, reason: 'invalid-title' });
  });
});

describe(writeNote, () => {
  let kbPath: string;

  // Each test gets a fresh temp directory; we intentionally leave artifacts in `tmpdir` so a failed test's state
  // is available for inspection.
  beforeEach(async () => {
    kbPath = await mkdtemp(join(tmpdir(), 'kb-add-write-'));
  });

  it('writes a note directly under content/assertions when no folder is given', async () => {
    const outcome = await writeNote({
      kbPath,
      folder: null,
      title: 'Hello',
      record: buildRecord({ body: '\nBody text.\n' }),
    });

    const expectedPath = join(kbPath, 'content', 'assertions', 'Hello.md');
    expect(outcome).toEqual({ ok: true, path: expectedPath });
    const content = await readFile(expectedPath, 'utf8');
    expect(content).toContain('title: Sample');
    expect(content).toContain('Body text.');
  });

  it('treats --folder as a topic subpath beneath content/assertions', async () => {
    const outcome = await writeNote({
      kbPath,
      folder: 'languages/typescript',
      title: 'Generics',
      record: buildRecord(),
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.path).toBe(join(kbPath, 'content', 'assertions', 'languages', 'typescript', 'Generics.md'));
      const stats = await stat(outcome.path);
      expect(stats.isFile()).toBe(true);
    }
  });

  it('refuses to overwrite an existing file and reports the existing path', async () => {
    const existing = join(kbPath, 'content', 'assertions', 'Hello.md');
    await mkdir(dirname(existing), { recursive: true });
    await writeFile(existing, 'pre-existing content\n', 'utf8');

    const outcome = await writeNote({
      kbPath,
      folder: null,
      title: 'Hello',
      record: buildRecord({ body: '\nNew body.\n' }),
    });

    expect(outcome).toEqual({ ok: false, reason: 'collision', existingPath: existing });
    expect(await readFile(existing, 'utf8')).toBe('pre-existing content\n');
  });

  it('refuses to overwrite an existing file under a nested folder and preserves its content', async () => {
    const nestedDir = join(kbPath, 'content', 'assertions', 'languages', 'typescript');
    await mkdir(nestedDir, { recursive: true });
    await writeFile(join(nestedDir, 'Generics.md'), 'pre-existing nested content\n', 'utf8');

    const outcome = await writeNote({
      kbPath,
      folder: 'languages/typescript',
      title: 'Generics',
      record: buildRecord({ body: '\nNew body.\n' }),
    });

    expect(outcome).toEqual({ ok: false, reason: 'collision', existingPath: join(nestedDir, 'Generics.md') });
    expect(await readFile(join(nestedDir, 'Generics.md'), 'utf8')).toBe('pre-existing nested content\n');
  });

  it('returns invalid-title for a path-separator title without writing', async () => {
    const outcome = await writeNote({
      kbPath,
      folder: null,
      title: 'foo/bar',
      record: buildRecord(),
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid-title' });
    expect(await readdir(kbPath)).toEqual([]);
  });

  it('does not leave a temp file at the destination after a successful write', async () => {
    await writeNote({
      kbPath,
      folder: null,
      title: 'Hello',
      record: buildRecord({ body: '\nBody.\n' }),
    });

    expect(await readdir(join(kbPath, 'content', 'assertions'))).toEqual(['Hello.md']);
  });

  it('refuses a folder that escapes the assertions root via .. without writing or creating directories', async () => {
    const outcome = await writeNote({
      kbPath,
      folder: '../../etc',
      title: 'Escape',
      record: buildRecord({ body: '\nBody.\n' }),
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid-folder' });
    expect(await readdir(kbPath)).toEqual([]);
  });

  it('refuses a folder that uses nested .. to climb out of the assertions root', async () => {
    const outcome = await writeNote({
      kbPath,
      folder: 'a/../../sibling',
      title: 'Escape',
      record: buildRecord({ body: '\nBody.\n' }),
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid-folder' });
  });

  it('accepts a folder that uses .. but stays inside the assertions root', async () => {
    const outcome = await writeNote({
      kbPath,
      folder: 'a/b/..',
      title: 'Inside',
      record: buildRecord(),
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.path).toBe(join(kbPath, 'content', 'assertions', 'a', 'Inside.md'));
    }
  });

  it('refuses a folder that re-names the assertions archetype segment', async () => {
    const outcome = await writeNote({
      kbPath,
      folder: 'assertions/tools',
      title: 'Doubled',
      record: buildRecord(),
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid-folder' });
    if (!outcome.ok && outcome.reason === 'invalid-folder') {
      expect(outcome.message).toContain('assertions/');
    }
    expect(await readdir(kbPath)).toEqual([]);
  });
});
