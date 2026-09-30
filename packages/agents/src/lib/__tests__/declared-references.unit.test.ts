import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DeclaredReference } from '../codeassembly-manifest.ts';
import { resolveDeclaredReferences } from '../declared-references.ts';

const DECLARED_IN = '/project/.agents/codeassembly.yaml';

describe(resolveDeclaredReferences, () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = path.join(tmpdir(), `agents-test-refs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(baseDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('resolves a directory inside an installed package to its node_modules path', async () => {
    await installPackage(baseDir, '@ca-fixture/next', ['dist/docs/index.md']);

    const result = await resolveDeclaredReferences([buildReference({ resolveFrom: baseDir })]);

    expect(result).toEqual({
      resolved: [
        {
          name: 'docs',
          summary: 'Read the docs.',
          target: path.join(baseDir, 'node_modules', '@ca-fixture', 'next', 'dist', 'docs'),
        },
      ],
      defects: [],
    });
  });

  it('resolves a file target', async () => {
    await installPackage(baseDir, '@ca-fixture/next', ['README.md']);

    const { resolved } = await resolveDeclaredReferences([buildReference({ resolveFrom: baseDir, path: 'README.md' })]);

    expect(resolved.map((reference) => reference.target)).toEqual([
      path.join(baseDir, 'node_modules', '@ca-fixture', 'next', 'README.md'),
    ]);
  });

  it('resolves through a symlinked package entry without replacing it by the realpath', async () => {
    const realDir = path.join(baseDir, '.pnpm', 'next', 'node_modules', '@ca-fixture', 'next');
    await mkdir(path.join(realDir, 'dist', 'docs'), { recursive: true });
    await writeFile(path.join(realDir, 'package.json'), '{}', 'utf8');
    await mkdir(path.join(baseDir, 'node_modules', '@ca-fixture'), { recursive: true });
    await symlink(realDir, path.join(baseDir, 'node_modules', '@ca-fixture', 'next'), 'dir');

    const { resolved } = await resolveDeclaredReferences([buildReference({ resolveFrom: baseDir })]);

    expect(resolved.map((reference) => reference.target)).toEqual([
      path.join(baseDir, 'node_modules', '@ca-fixture', 'next', 'dist', 'docs'),
    ]);
  });

  it('resolves a package installed only under resolve-from, and names every searched directory without it', async () => {
    const appDir = path.join(baseDir, 'apps', 'web');
    await installPackage(appDir, '@ca-fixture/next', ['dist/docs/index.md']);

    const fromApp = await resolveDeclaredReferences([buildReference({ resolveFrom: appDir })]);
    const fromRoot = await resolveDeclaredReferences([buildReference({ resolveFrom: baseDir })]);

    expect(fromApp.defects).toEqual([]);
    expect(fromApp.resolved).toHaveLength(1);
    expect(fromRoot.resolved).toEqual([]);
    expect(fromRoot.defects).toEqual([
      {
        file: DECLARED_IN,
        kind: 'resolution',
        detail: expect.stringContaining(
          `Reference "docs": package "@ca-fixture/next" is not installed. Searched: ${path.join(baseDir, 'node_modules', '@ca-fixture', 'next')}, `,
        ),
      },
    ]);
  });

  it('resolves a package hoisted to an ancestor of resolve-from', async () => {
    const appDir = path.join(baseDir, 'apps', 'web');
    await mkdir(appDir, { recursive: true });
    await installPackage(baseDir, '@ca-fixture/next', ['dist/docs/index.md']);

    const { resolved, defects } = await resolveDeclaredReferences([buildReference({ resolveFrom: appDir })]);

    expect(defects).toEqual([]);
    expect(resolved).toHaveLength(1);
  });

  it('locates a package whose package.json does not parse', async () => {
    const dir = await installPackage(baseDir, '@ca-fixture/next', ['dist/docs/index.md']);
    await writeFile(path.join(dir, 'package.json'), '{ not json', 'utf8');

    const { defects } = await resolveDeclaredReferences([buildReference({ resolveFrom: baseDir })]);

    expect(defects).toEqual([]);
  });

  it.each([
    ['a missing path', { path: 'dist/absent' }, 'path "dist/absent" does not exist in package "@ca-fixture/next"'],
    ['an escaping path', { path: '../other' }, 'path "../other" is not inside package "@ca-fixture/next"'],
    ['an absolute path', { path: '/etc' }, 'path "/etc" is not inside package "@ca-fixture/next"'],
    ['a filesystem-path package', { package: './vendor' }, 'package "./vendor" is a filesystem path'],
  ])('reports %s as one defect attributed to the declaring file', async (_label, overrides, message) => {
    await installPackage(baseDir, '@ca-fixture/next', ['dist/docs/index.md']);
    await mkdir(path.join(baseDir, 'node_modules', '@ca-fixture', 'other'), { recursive: true });

    const { resolved, defects } = await resolveDeclaredReferences([
      buildReference({ resolveFrom: baseDir, ...overrides }),
    ]);

    expect(resolved).toEqual([]);
    expect(defects).toEqual([
      { file: DECLARED_IN, kind: 'resolution', detail: expect.stringContaining(`Reference "docs": ${message}`) },
    ]);
  });

  it('reports a resolve-from that is not a directory', async () => {
    const filePath = path.join(baseDir, 'not-a-dir');
    await writeFile(filePath, '', 'utf8');

    const results = await Promise.all(
      [filePath, path.join(baseDir, 'absent')].map((resolveFrom) =>
        resolveDeclaredReferences([buildReference({ resolveFrom })]),
      ),
    );

    expect(results.map(({ defects }) => defects.map((defect) => defect.detail))).toEqual([
      [`Reference "docs": resolve-from ${filePath} is not a directory.`],
      [`Reference "docs": resolve-from ${path.join(baseDir, 'absent')} is not a directory.`],
    ]);
  });

  it('reports every failing reference and resolves the rest', async () => {
    await installPackage(baseDir, '@ca-fixture/next', ['dist/docs/index.md']);

    const { resolved, defects } = await resolveDeclaredReferences([
      buildReference({ name: 'bad-one', resolveFrom: baseDir, path: 'absent' }),
      buildReference({ name: 'good', resolveFrom: baseDir }),
      buildReference({ name: 'bad-two', resolveFrom: baseDir, package: '@ca-fixture/absent' }),
    ]);

    expect(resolved.map((reference) => reference.name)).toEqual(['good']);
    expect(defects.map((defect) => defect.detail.split(':', 1)[0])).toEqual([
      'Reference "bad-one"',
      'Reference "bad-two"',
    ]);
  });
});

// region | Helpers

/** Builds a declared reference to `@ca-fixture/next`'s `dist/docs`, overriding any field. */
function buildReference(overrides: Partial<DeclaredReference> & { resolveFrom: string }): DeclaredReference {
  return {
    name: 'docs',
    package: '@ca-fixture/next',
    path: 'dist/docs',
    summary: 'Read the docs.',
    declaredIn: DECLARED_IN,
    ...overrides,
  };
}

/** Installs a package under `baseDir/node_modules` with a `package.json` and the given files, returning its directory. */
async function installPackage(baseDir: string, name: string, files: ReadonlyArray<string>): Promise<string> {
  const dir = path.join(baseDir, 'node_modules', name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name }), 'utf8');
  for (const file of files) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), '', 'utf8');
  }
  return dir;
}

// endregion | Helpers
