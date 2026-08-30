import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type DeclaredSource, describeMissingSource, resolveDeclaredSources } from '../declared-sources.ts';

describe(resolveDeclaredSources, () => {
  let root: string;

  beforeEach(async () => {
    root = path.join(tmpdir(), `agents-test-declared-sources-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(path.join(root, 'library'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resolves the library as the only root when no declaration exists', async () => {
    expect(
      await resolveDeclaredSources({ baseDir: root, contentDir: libraryDir(root), declaration: undefined }),
    ).toEqual({ sources: [], missingSources: [], roots: [{ dir: libraryDir(root) }] });
  });

  it('resolves hand-declared sources in declaration order', async () => {
    const first = await makeSourceDir(root, 'first');
    const second = await makeSourceDir(root, 'second');

    const { sources } = await resolveDeclaredSources({
      baseDir: root,
      contentDir: libraryDir(root),
      declaration: {
        packages: [],
        sources: [
          { name: 'first', dir: first },
          { name: 'second', dir: second },
        ],
      },
    });

    expect(sources).toEqual([
      { name: 'first', dir: first, declaredAs: 'path' },
      { name: 'second', dir: second, declaredAs: 'path' },
    ]);
  });

  it('ranks a hand-declared source above a package source', async () => {
    const handDeclared = await makeSourceDir(root, 'hand-declared');
    const packageDir = await installPackage(root, 'ca-fixture-guidance');

    const { sources } = await resolveDeclaredSources({
      baseDir: root,
      contentDir: libraryDir(root),
      declaration: { packages: ['ca-fixture-guidance'], sources: [{ name: 'hand-declared', dir: handDeclared }] },
    });

    expect(sources).toEqual([
      { name: 'hand-declared', dir: handDeclared, declaredAs: 'path' },
      { name: 'ca-fixture-guidance', dir: packageDir, declaredAs: 'package' },
    ]);
  });

  it('reports a source whose directory does not exist without failing', async () => {
    const absent = path.join(root, 'not-yet');

    const { sources, missingSources } = await resolveDeclaredSources({
      baseDir: root,
      contentDir: libraryDir(root),
      declaration: { packages: [], sources: [{ name: 'not-yet', dir: absent }] },
    });

    expect(sources).toEqual([{ name: 'not-yet', dir: absent, declaredAs: 'path' }]);
    expect(missingSources).toEqual([{ name: 'not-yet', dir: absent, declaredAs: 'path' }]);
  });

  it('leaves a missing source out of the roots', async () => {
    const present = await makeSourceDir(root, 'present');

    const { roots } = await resolveDeclaredSources({
      baseDir: root,
      contentDir: libraryDir(root),
      declaration: {
        packages: [],
        sources: [
          { name: 'present', dir: present },
          { name: 'not-yet', dir: path.join(root, 'not-yet') },
        ],
      },
    });

    expect(roots).toEqual([{ name: 'present', dir: present, declaredAs: 'path' }, { dir: libraryDir(root) }]);
  });

  it('rejects a source path that is not a directory', async () => {
    const filePath = path.join(root, 'a-file');
    await writeFile(filePath, '', 'utf8');

    await expect(
      resolveDeclaredSources({
        baseDir: root,
        contentDir: libraryDir(root),
        declaration: { packages: [], sources: [{ name: 'a-file', dir: filePath }] },
      }),
    ).rejects.toThrow(/Invalid declared source/);
  });

  it('rejects a source name that would escape its namespace', async () => {
    const dir = await makeSourceDir(root, 'escaping');

    await expect(
      resolveDeclaredSources({
        baseDir: root,
        contentDir: libraryDir(root),
        declaration: { packages: [], sources: [{ name: '../escape', dir }] },
      }),
    ).rejects.toThrow(/Unusable declared source name/);
  });

  it('rejects two sources claiming one name', async () => {
    const first = await makeSourceDir(root, 'first');
    const second = await makeSourceDir(root, 'second');

    await expect(
      resolveDeclaredSources({
        baseDir: root,
        contentDir: libraryDir(root),
        declaration: {
          packages: [],
          sources: [
            { name: 'shared', dir: first },
            { name: 'shared', dir: second },
          ],
        },
      }),
    ).rejects.toThrow(/claimed more than once/);
  });

  it('rejects a source declaring an unsupported content format', async () => {
    const dir = await makeSourceDir(root, 'future');
    await writeFile(path.join(dir, 'codeassembly-content.yaml'), 'format: 99\n', 'utf8');

    await expect(
      resolveDeclaredSources({
        baseDir: root,
        contentDir: libraryDir(root),
        declaration: { packages: [], sources: [{ name: 'future', dir }] },
      }),
    ).rejects.toThrow(/Unsupported content format/);
  });

  // An unreadable directory and an unsupported format are both present; the source check must be the one that reports,
  // because a directory that cannot be read has no format to compare against.
  it('reports an unreadable source ahead of an unsupported format elsewhere', async () => {
    const future = await makeSourceDir(root, 'future');
    await writeFile(path.join(future, 'codeassembly-content.yaml'), 'format: 99\n', 'utf8');
    const filePath = path.join(root, 'a-file');
    await writeFile(filePath, '', 'utf8');

    await expect(
      resolveDeclaredSources({
        baseDir: root,
        contentDir: libraryDir(root),
        declaration: {
          packages: [],
          sources: [
            { name: 'future', dir: future },
            { name: 'a-file', dir: filePath },
          ],
        },
      }),
    ).rejects.toThrow(/Invalid declared source/);
  });

  it('rejects a library declaring an unsupported content format when no declaration exists', async () => {
    await writeFile(path.join(libraryDir(root), 'codeassembly-content.yaml'), 'format: 99\n', 'utf8');

    await expect(
      resolveDeclaredSources({ baseDir: root, contentDir: libraryDir(root), declaration: undefined }),
    ).rejects.toThrow(/Unsupported content format/);
  });
});

describe(describeMissingSource, () => {
  it('names the declaration path as the remedy for a hand-declared source', () => {
    const source: DeclaredSource = { name: 'team', dir: '/nowhere/team', declaredAs: 'path' };

    expect(describeMissingSource(source)).toEqual({
      level: 'warn',
      text: expect.stringContaining("correct the source's `path`"),
    });
  });

  it('names the package manifest as the remedy for a package source', () => {
    const source: DeclaredSource = { name: '@acme/guidance', dir: '/nowhere/acme', declaredAs: 'package' };

    expect(describeMissingSource(source).text).toContain('`codeassembly.content`');
  });
});

// region | Helpers

/** Writes a `package.json` declaring a `codeassembly.content` directory into `root`'s `node_modules`, and creates it. */
async function installPackage(root: string, name: string): Promise<string> {
  const packageDir = path.join(root, 'node_modules', name);
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', codeassembly: { content: 'content' } }),
    'utf8',
  );
  const contentDir = path.join(packageDir, 'content');
  await mkdir(contentDir, { recursive: true });
  return contentDir;
}

/** The library content directory every case resolves against. */
function libraryDir(root: string): string {
  return path.join(root, 'library');
}

/** Creates a source directory under `root` and returns its path. */
async function makeSourceDir(root: string, name: string): Promise<string> {
  const dir = path.join(root, name);
  await mkdir(dir, { recursive: true });
  return dir;
}

// endregion | Helpers
