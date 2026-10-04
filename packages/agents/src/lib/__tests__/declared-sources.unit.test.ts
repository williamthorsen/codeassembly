import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type DeclaredSource,
  describeContentRoot,
  describeMissingSource,
  NoContentSourceError,
  resolveDeclaredSources,
} from '../declared-sources.ts';

describe(resolveDeclaredSources, () => {
  let root: string;

  beforeEach(async () => {
    root = path.join(tmpdir(), `agents-test-declared-sources-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resolves hand-declared sources in declaration order', async () => {
    const first = await makeSourceDir(root, 'first');
    const second = await makeSourceDir(root, 'second');

    const { sources } = await resolveDeclaredSources({
      baseDir: root,
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
      declaration: { packages: ['ca-fixture-guidance'], sources: [{ name: 'hand-declared', dir: handDeclared }] },
    });

    expect(sources).toEqual([
      { name: 'hand-declared', dir: handDeclared, declaredAs: 'path' },
      { name: 'ca-fixture-guidance', dir: packageDir, declaredAs: 'package' },
    ]);
  });

  it('resolves a package-named source in its declared position, above every packages entry', async () => {
    const first = await makeSourceDir(root, 'first');
    const libDir = await installPackage(root, 'ca-fixture-lib');
    const packageDir = await installPackage(root, 'ca-fixture-guidance');

    const { sources } = await resolveDeclaredSources({
      baseDir: root,
      declaration: {
        packages: ['ca-fixture-guidance'],
        sources: [
          { name: 'first', dir: first },
          { name: 'lib', package: 'ca-fixture-lib' },
        ],
      },
    });

    expect(sources).toEqual([
      { name: 'first', dir: first, declaredAs: 'path' },
      { name: 'lib', dir: libDir, declaredAs: 'source-package' },
      { name: 'ca-fixture-guidance', dir: packageDir, declaredAs: 'package' },
    ]);
  });

  it('rejects a package-named source that is not installed, naming the source and the package', async () => {
    await expect(
      resolveDeclaredSources({
        baseDir: root,
        declaration: { packages: [], sources: [{ name: 'lib', package: 'ca-fixture-absent' }] },
      }),
    ).rejects.toThrow('Declared source "lib" (package "ca-fixture-absent") is not installed.');
  });

  it('rejects a package-named source whose package does not declare any content', async () => {
    const packageDir = path.join(root, 'node_modules', 'ca-fixture-plain');
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name: 'ca-fixture-plain' }), 'utf8');

    await expect(
      resolveDeclaredSources({
        baseDir: root,
        declaration: { packages: [], sources: [{ name: 'ca-fixture-plain', package: 'ca-fixture-plain' }] },
      }),
    ).rejects.toThrow(/"ca-fixture-plain" does not declare any CodeAssembly content/);
  });

  it('reports a source whose directory does not exist without failing when another source is present', async () => {
    const present = await makeSourceDir(root, 'present');
    const absent = path.join(root, 'not-yet');

    const { sources, missingSources } = await resolveDeclaredSources({
      baseDir: root,
      declaration: {
        packages: [],
        sources: [
          { name: 'present', dir: present },
          { name: 'not-yet', dir: absent },
        ],
      },
    });

    expect(sources).toEqual([
      { name: 'present', dir: present, declaredAs: 'path' },
      { name: 'not-yet', dir: absent, declaredAs: 'path' },
    ]);
    expect(missingSources).toEqual([{ name: 'not-yet', dir: absent, declaredAs: 'path' }]);
  });

  it('leaves a missing source out of the roots', async () => {
    const present = await makeSourceDir(root, 'present');

    const { roots } = await resolveDeclaredSources({
      baseDir: root,
      declaration: {
        packages: [],
        sources: [
          { name: 'present', dir: present },
          { name: 'not-yet', dir: path.join(root, 'not-yet') },
        ],
      },
    });

    expect(roots).toEqual([{ name: 'present', dir: present, declaredAs: 'path' }]);
  });

  it('rejects a source path that is not a directory', async () => {
    const filePath = path.join(root, 'a-file');
    await writeFile(filePath, '', 'utf8');

    await expect(
      resolveDeclaredSources({
        baseDir: root,
        declaration: { packages: [], sources: [{ name: 'a-file', dir: filePath }] },
      }),
    ).rejects.toThrow(/Invalid declared source/);
  });

  it('rejects a source name that would escape its namespace', async () => {
    const dir = await makeSourceDir(root, 'escaping');

    await expect(
      resolveDeclaredSources({
        baseDir: root,
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
        declaration: { packages: [], sources: [{ name: 'future', dir }] },
      }),
    ).rejects.toThrow(/Unsupported content format/);
  });

  // An unreadable directory and an unsupported format are both present; the source check must be the one that reports,
  // because a directory that cannot be read does not yield a format to compare against.
  it('reports an unreadable source ahead of an unsupported format elsewhere', async () => {
    const future = await makeSourceDir(root, 'future');
    await writeFile(path.join(future, 'codeassembly-content.yaml'), 'format: 99\n', 'utf8');
    const filePath = path.join(root, 'a-file');
    await writeFile(filePath, '', 'utf8');

    await expect(
      resolveDeclaredSources({
        baseDir: root,
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

  describe('without a usable source', () => {
    it('throws NoContentSourceError when the declaration is absent', async () => {
      const promise = resolveDeclaredSources({ baseDir: root, declaration: undefined });

      await expect(promise).rejects.toBeInstanceOf(NoContentSourceError);
      await expect(promise).rejects.toThrow(/No content source is declared/);
    });

    it('throws NoContentSourceError for a declaration that does not declare any source or package', async () => {
      const promise = resolveDeclaredSources({
        baseDir: root,
        declaration: { packages: [], sources: [] },
      });

      await expect(promise).rejects.toBeInstanceOf(NoContentSourceError);
      await expect(promise).rejects.toThrow(/No content source is declared/);
    });

    it('throws NoContentSourceError naming every missing source when none of the declared directories exists', async () => {
      const first = path.join(root, 'first-absent');
      const second = path.join(root, 'second-absent');

      const promise = resolveDeclaredSources({
        baseDir: root,
        declaration: {
          packages: [],
          sources: [
            { name: 'first', dir: first },
            { name: 'second', dir: second },
          ],
        },
      });

      await expect(promise).rejects.toBeInstanceOf(NoContentSourceError);
      await expect(promise).rejects.toThrow(
        `None of the declared content sources exists: "first" (${first}), "second" (${second}).`,
      );
    });

    it('names the declaration file, its local tier, and a sources example', async () => {
      const error = await captureNoSourceError(root);

      expect(error.message).toContain(path.join(root, '.agents', 'codeassembly.yaml'));
      expect(error.message).toContain(path.join(root, '.agents', 'codeassembly.local.yaml'));
      expect(error.message).toContain('sources:\n  - name: codeassembly-guidance\n    path: ');
    });
  });
});

describe(describeContentRoot, () => {
  it('renders the source name and its directory', () => {
    expect(describeContentRoot({ name: 'team', dir: '/srcs/team' })).toBe('source "team" (/srcs/team)');
  });
});

describe(describeMissingSource, () => {
  it('names the declaration path as the remedy for a hand-declared source', () => {
    const source: DeclaredSource = { name: 'team', dir: '/nowhere/team', declaredAs: 'path' };

    expect(describeMissingSource(source)).toEqual({
      glyph: 'warning',
      level: 'warn',
      text: expect.stringContaining("correct the source's `path`"),
    });
  });

  it('names the package manifest as the remedy for a package source', () => {
    const source: DeclaredSource = { name: '@acme/guidance', dir: '/nowhere/acme', declaredAs: 'package' };

    expect(describeMissingSource(source).text).toContain('`codeassembly.content`');
    expect(describeMissingSource(source).text).toContain('drop the entry from `packages`');
  });

  it('names the package manifest and the sources entry as the remedy for a package-named source', () => {
    const source: DeclaredSource = { name: 'lib', dir: '/nowhere/lib', declaredAs: 'source-package' };
    const { text } = describeMissingSource(source);

    expect(text).toContain('`codeassembly.content`');
    expect(text).toContain('drop the entry from `sources`');
  });
});

// region | Helpers

/** Resolves an absent declaration and returns the `NoContentSourceError` that it throws. */
async function captureNoSourceError(root: string): Promise<NoContentSourceError> {
  try {
    await resolveDeclaredSources({ baseDir: root, declaration: undefined });
  } catch (error: unknown) {
    if (error instanceof NoContentSourceError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected resolveDeclaredSources to throw NoContentSourceError');
}

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

/** Creates a source directory under `root` and returns its path. */
async function makeSourceDir(root: string, name: string): Promise<string> {
  const dir = path.join(root, name);
  await mkdir(dir, { recursive: true });
  return dir;
}

// endregion | Helpers
