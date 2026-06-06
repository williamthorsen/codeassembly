import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Frontmatter } from '@codeassembly/kb';
import { beforeEach, describe, expect, it } from 'vitest';

import { composeFilename, writeNote } from '../write-note.ts';

const baseFrontmatter: Frontmatter = {
  title: 'Sample',
  recordType: 'assertion',
  created: '2026-05-24',
  updated: '2026-05-24',
  tags: ['sample'],
  extra: {},
};

describe(composeFilename, () => {
  it('appends .md to a trimmed title', () => {
    expect(composeFilename('  Working with Node streams  ')).toEqual({
      ok: true,
      filename: 'Working with Node streams.md',
    });
  });

  it('rejects an empty title', () => {
    expect(composeFilename('   ')).toMatchObject({ ok: false, reason: 'invalid-title' });
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

  it('writes a note at KB root when no folder is given', async () => {
    const outcome = await writeNote({
      kbPath,
      folder: null,
      title: 'Hello',
      frontmatter: baseFrontmatter,
      body: 'Body text.\n',
    });

    expect(outcome).toEqual({ ok: true, path: join(kbPath, 'Hello.md') });
    const content = await readFile(join(kbPath, 'Hello.md'), 'utf8');
    expect(content).toContain('title: Sample');
    expect(content).toContain('Body text.');
  });

  it('creates nested folders that do not yet exist', async () => {
    const outcome = await writeNote({
      kbPath,
      folder: 'languages/typescript',
      title: 'Generics',
      frontmatter: baseFrontmatter,
      body: '',
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.path).toBe(join(kbPath, 'languages', 'typescript', 'Generics.md'));
      const stats = await stat(outcome.path);
      expect(stats.isFile()).toBe(true);
    }
  });

  it('refuses to overwrite an existing file and reports the existing path', async () => {
    await writeFile(join(kbPath, 'Hello.md'), 'pre-existing content\n', 'utf8');
    const outcome = await writeNote({
      kbPath,
      folder: null,
      title: 'Hello',
      frontmatter: baseFrontmatter,
      body: 'New body.\n',
    });

    expect(outcome).toEqual({ ok: false, reason: 'collision', existingPath: join(kbPath, 'Hello.md') });
    const content = await readFile(join(kbPath, 'Hello.md'), 'utf8');
    expect(content).toBe('pre-existing content\n');
  });

  it('refuses to overwrite an existing file under a nested folder and preserves its content', async () => {
    const nestedDir = join(kbPath, 'languages', 'typescript');
    await mkdir(nestedDir, { recursive: true });
    await writeFile(join(nestedDir, 'Generics.md'), 'pre-existing nested content\n', 'utf8');

    const outcome = await writeNote({
      kbPath,
      folder: 'languages/typescript',
      title: 'Generics',
      frontmatter: baseFrontmatter,
      body: 'New body.\n',
    });

    expect(outcome).toEqual({
      ok: false,
      reason: 'collision',
      existingPath: join(nestedDir, 'Generics.md'),
    });
    const content = await readFile(join(nestedDir, 'Generics.md'), 'utf8');
    expect(content).toBe('pre-existing nested content\n');
  });

  it('returns invalid-title for a path-separator title without writing', async () => {
    const outcome = await writeNote({
      kbPath,
      folder: null,
      title: 'foo/bar',
      frontmatter: baseFrontmatter,
      body: '',
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid-title' });
    const entries = await readdir(kbPath);
    expect(entries).toEqual([]);
  });

  it('does not leave a temp file at the destination after a successful write', async () => {
    await writeNote({
      kbPath,
      folder: null,
      title: 'Hello',
      frontmatter: baseFrontmatter,
      body: 'Body.\n',
    });

    const entries = await readdir(kbPath);
    expect(entries).toEqual(['Hello.md']);
  });

  it('refuses a folder that escapes the KB root via .. without writing or creating directories', async () => {
    const outcome = await writeNote({
      kbPath,
      folder: '../../etc',
      title: 'Escape',
      frontmatter: baseFrontmatter,
      body: 'Body.\n',
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid-folder' });
    const entries = await readdir(kbPath);
    expect(entries).toEqual([]);
  });

  it('refuses a folder that uses nested .. to climb out of the KB root', async () => {
    const outcome = await writeNote({
      kbPath,
      folder: 'a/../../sibling',
      title: 'Escape',
      frontmatter: baseFrontmatter,
      body: 'Body.\n',
    });

    expect(outcome).toMatchObject({ ok: false, reason: 'invalid-folder' });
  });

  it('accepts a folder that uses .. but stays inside the KB root', async () => {
    const outcome = await writeNote({
      kbPath,
      folder: 'a/b/..',
      title: 'Inside',
      frontmatter: baseFrontmatter,
      body: '',
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.path).toBe(join(kbPath, 'a', 'Inside.md'));
    }
  });
});
