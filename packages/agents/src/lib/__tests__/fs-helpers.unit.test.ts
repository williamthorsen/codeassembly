import { statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isTestDirectory, isUnderTestDirectory, readFileOrEmpty, writeIfChanged } from '../fs-helpers.ts';

describe(isTestDirectory, () => {
  it('matches the test directory name', () => {
    expect(isTestDirectory('__tests__')).toBe(true);
  });

  it('does not match a support-content directory sharing the underscore prefix', () => {
    expect(isTestDirectory('_data')).toBe(false);
  });
});

describe(isUnderTestDirectory, () => {
  it('matches a path passing through a test directory at any depth', () => {
    expect(isUnderTestDirectory('__tests__/fixtures/collections/recommended.md')).toBe(true);
  });

  it('matches a test directory nested below the walk root', () => {
    expect(isUnderTestDirectory('skills/capture-event/__tests__/helper.md')).toBe(true);
  });

  it('matches a Windows-separated path', () => {
    expect(isUnderTestDirectory('skills\\capture-event\\__tests__\\helper.md')).toBe(true);
  });

  it('does not match a path whose segments merely resemble the test directory', () => {
    expect(isUnderTestDirectory('skills/__tests__helper/SKILL.md')).toBe(false);
  });

  it('does not match deliverable content', () => {
    expect(isUnderTestDirectory('skills/capture-event/SKILL.md')).toBe(false);
  });
});

describe(readFileOrEmpty, () => {
  let dir: string;

  beforeEach(async () => {
    dir = path.join(tmpdir(), `agents-test-fs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns the file contents when the file exists', async () => {
    const file = path.join(dir, 'present.txt');
    await writeFile(file, 'hello', 'utf8');

    expect(await readFileOrEmpty(file)).toBe('hello');
  });

  it('returns an empty string when the file does not exist', async () => {
    expect(await readFileOrEmpty(path.join(dir, 'absent.txt'))).toBe('');
  });
});

describe(writeIfChanged, () => {
  let dir: string;

  beforeEach(async () => {
    dir = path.join(tmpdir(), `agents-test-fs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes the content when the file does not yet exist', async () => {
    const file = path.join(dir, 'new.txt');

    await writeIfChanged(file, 'content');

    expect(await readFile(file, 'utf8')).toBe('content');
  });

  it('does not rewrite the file when the content is unchanged', async () => {
    const file = path.join(dir, 'stable.txt');
    await writeIfChanged(file, 'content');
    const firstMtime = statSync(file).mtimeMs;

    await writeIfChanged(file, 'content');

    expect(statSync(file).mtimeMs).toBe(firstMtime);
  });

  it('rewrites the file when the content differs', async () => {
    const file = path.join(dir, 'changing.txt');
    await writeIfChanged(file, 'before');

    await writeIfChanged(file, 'after');

    expect(await readFile(file, 'utf8')).toBe('after');
  });
});
