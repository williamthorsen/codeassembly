import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assertSupportedContentFormats,
  findContentFormatProblem,
  readContentRootManifest,
} from '../content-root-manifest.ts';

describe(readContentRootManifest, () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await makeBaseDir();
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('reads a root with no manifest as format 1', async () => {
    const root = await makeRoot(baseDir, 'bare');

    expect(await readContentRootManifest(root)).toEqual({ format: 1 });
  });

  it('reads the declared format', async () => {
    const root = await makeRoot(baseDir, 'declared', 'format: 1\n');

    expect(await readContentRootManifest(root)).toEqual({ format: 1 });
  });

  it('reads a format this tool does not support, leaving the support decision to the caller', async () => {
    const root = await makeRoot(baseDir, 'ahead', 'format: 99\n');

    expect(await readContentRootManifest(root)).toEqual({ format: 99 });
  });

  it('accepts an unknown key alongside the format', async () => {
    const root = await makeRoot(baseDir, 'reserved', 'format: 1\nhelpers:\n  - src/kb-add/cli.ts\n');

    expect(await readContentRootManifest(root)).toEqual({ format: 1 });
  });

  it('rejects a manifest whose YAML will not parse, naming the file', async () => {
    const root = await makeRoot(baseDir, 'unparseable', 'format: [1\n');

    await expect(readContentRootManifest(root)).rejects.toThrow(root);
  });

  it.each([
    ['no format key', 'helpers: []\n'],
    ['an empty document', '\n'],
    ['a string format', "format: '1'\n"],
    ['a zero format', 'format: 0\n'],
    ['a negative format', 'format: -1\n'],
    ['a fractional format', 'format: 1.5\n'],
  ])('rejects a manifest with %s', async (label, body) => {
    const root = await makeRoot(baseDir, `invalid-${label.replaceAll(' ', '-')}`, body);

    await expect(readContentRootManifest(root)).rejects.toThrow(/format/);
  });
});

describe(findContentFormatProblem, () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await makeBaseDir();
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('reports no problem for a root with no manifest', async () => {
    const root = await makeRoot(baseDir, 'bare');

    expect(await findContentFormatProblem(root)).toBeUndefined();
  });

  it('reports no problem for a supported format', async () => {
    const root = await makeRoot(baseDir, 'supported', 'format: 1\n');

    expect(await findContentFormatProblem(root)).toBeUndefined();
  });

  it('classifies a format outside the supported set as unsupported', async () => {
    const root = await makeRoot(baseDir, 'ahead', 'format: 2\n');

    expect(await findContentFormatProblem(root)).toEqual({ kind: 'unsupported', detail: expect.stringContaining('2') });
  });

  it('classifies an unreadable manifest as malformed, naming the file', async () => {
    const root = await makeRoot(baseDir, 'unparseable', 'format: [1\n');

    const problem = await findContentFormatProblem(root);

    expect(problem?.kind).toBe('malformed');
    expect(problem?.detail).toContain(root);
  });
});

describe(assertSupportedContentFormats, () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await makeBaseDir();
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('passes roots that declare a supported format or none at all', async () => {
    const declared = await makeRoot(baseDir, 'declared', 'format: 1\n');
    const bare = await makeRoot(baseDir, 'bare');

    await expect(
      assertSupportedContentFormats([{ name: 'declared', dir: declared }, { dir: bare }]),
    ).resolves.toBeUndefined();
  });

  it('names every unsupported root, its declared format, and the supported formats', async () => {
    const first = await makeRoot(baseDir, 'first', 'format: 2\n');
    const second = await makeRoot(baseDir, 'second', 'format: 3\n');

    const failure = assertSupportedContentFormats([
      { name: 'org-guidance', dir: first },
      { name: 'personal', dir: second },
    ]);

    await expect(failure).rejects.toThrow(/org-guidance.*2.*personal.*3/s);
    await expect(failure).rejects.toThrow(/supports content format 1/);
  });

  it('attributes an unnamed root by its directory', async () => {
    const root = await makeRoot(baseDir, 'library', 'format: 2\n');

    await expect(assertSupportedContentFormats([{ dir: root }])).rejects.toThrow(root);
  });

  // A manifest that will not parse has no declared version to compare, so it raises on its own rather than being
  // folded into the version mismatch a reader would then be told to fix by upgrading.
  it('raises a malformed manifest separately from an unsupported format', async () => {
    const malformed = await makeRoot(baseDir, 'malformed', 'format: [1\n');
    const unsupported = await makeRoot(baseDir, 'unsupported', 'format: 2\n');

    await expect(
      assertSupportedContentFormats([
        { name: 'a', dir: malformed },
        { name: 'b', dir: unsupported },
      ]),
    ).rejects.toThrow(/Unreadable content manifest/);
  });
});

// region | Helpers

/** Creates a uniquely named temp directory to hold the fixture content roots. */
async function makeBaseDir(): Promise<string> {
  const dir = path.join(tmpdir(), `agents-test-content-format-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Creates a content root under `baseDir`, writing `manifest` as its `codeassembly-content.yaml` when given. */
async function makeRoot(baseDir: string, name: string, manifest?: string): Promise<string> {
  const dir = path.join(baseDir, name);
  await mkdir(dir, { recursive: true });
  if (manifest !== undefined) {
    await writeFile(path.join(dir, 'codeassembly-content.yaml'), manifest, 'utf8');
  }
  return dir;
}

// endregion | Helpers
