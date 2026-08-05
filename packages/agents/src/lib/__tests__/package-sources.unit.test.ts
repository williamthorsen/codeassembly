import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findUndeclaredGuidancePackages, resolvePackageSources } from '../package-sources.ts';

describe(resolvePackageSources, () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await makeBaseDir('pkgsrc');
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('resolves an unscoped package to its declared content directory', async () => {
    const dir = await installPackage(baseDir, 'ca-fixture-unscoped', { codeassembly: { content: 'codeassembly' } });

    expect(await resolvePackageSources(['ca-fixture-unscoped'], baseDir)).toEqual([
      { name: 'ca-fixture-unscoped', dir: path.join(dir, 'codeassembly') },
    ]);
  });

  it('resolves a scoped package to a content directory nested under one it already owns', async () => {
    const dir = await installPackage(baseDir, '@ca-fixture/nmr', { codeassembly: { content: 'content/agents' } });

    expect(await resolvePackageSources(['@ca-fixture/nmr'], baseDir)).toEqual([
      { name: '@ca-fixture/nmr', dir: path.join(dir, 'content', 'agents') },
    ]);
  });

  it('resolves a package that ships no JavaScript at all', async () => {
    const dir = await installPackage(baseDir, '@ca-fixture/guidance-only', { codeassembly: { content: 'guidance' } });

    expect(await resolvePackageSources(['@ca-fixture/guidance-only'], baseDir)).toEqual([
      { name: '@ca-fixture/guidance-only', dir: path.join(dir, 'guidance') },
    ]);
  });

  // Mirrors how pnpm lays out both an external dependency (a link into `.pnpm/`) and a `workspace:*` sibling: the
  // `node_modules` entry is a symlink, and the content resolves through it to the real directory.
  it('resolves a package whose node_modules entry is a symlink', async () => {
    const realDir = path.join(baseDir, 'workspace-packages', 'linked');
    await mkdir(realDir, { recursive: true });
    await writeFile(
      path.join(realDir, 'package.json'),
      JSON.stringify({ name: '@ca-fixture/linked', codeassembly: { content: 'guidance' } }),
      'utf8',
    );
    await mkdir(path.join(baseDir, 'node_modules', '@ca-fixture'), { recursive: true });
    await symlink(realDir, path.join(baseDir, 'node_modules', '@ca-fixture', 'linked'), 'dir');

    expect(await resolvePackageSources(['@ca-fixture/linked'], baseDir)).toEqual([
      { name: '@ca-fixture/linked', dir: path.join(baseDir, 'node_modules', '@ca-fixture', 'linked', 'guidance') },
    ]);
  });

  it('preserves declaration order rather than sorting', async () => {
    await installPackage(baseDir, '@ca-fixture/beta', { codeassembly: { content: 'c' } });
    await installPackage(baseDir, '@ca-fixture/alpha', { codeassembly: { content: 'c' } });

    const resolved = await resolvePackageSources(['@ca-fixture/beta', '@ca-fixture/alpha'], baseDir);

    expect(resolved.map((source) => source.name)).toEqual(['@ca-fixture/beta', '@ca-fixture/alpha']);
  });

  it('throws when a declared package is not installed, naming the directories searched', async () => {
    await expect(resolvePackageSources(['@ca-fixture/absent'], baseDir)).rejects.toThrow(
      /not installed.*node_modules[/\\]@ca-fixture[/\\]absent/s,
    );
  });

  it('throws when a declared package name could never resolve from node_modules', async () => {
    await expect(resolvePackageSources(['node:fs'], baseDir)).rejects.toThrow(/"node:fs" is not installed/);
  });

  // Node answers a relative specifier with the anchor directory itself, so a path here names a directory rather than
  // resolving through `node_modules`: `./guidance` sits under `baseDir`, and `../sibling` outside it.
  it.each(['./guidance', '../sibling', '.', path.join(path.sep, 'abs', 'path')])(
    'throws when a declared name is the filesystem path %s',
    async (name) => {
      await expect(resolvePackageSources([name], baseDir)).rejects.toThrow(/is a filesystem path, not a package name/);
    },
  );

  it('resolves a path-shaped name to nothing rather than a directory that happens to sit there', async () => {
    const stray = path.join(baseDir, 'guidance');
    await mkdir(stray, { recursive: true });
    await writeFile(
      path.join(stray, 'package.json'),
      JSON.stringify({ name: 'stray', codeassembly: { content: 'c' } }),
      'utf8',
    );

    await expect(resolvePackageSources(['./guidance'], baseDir)).rejects.toThrow(/is a filesystem path/);
  });

  it('throws when a package declares no codeassembly content', async () => {
    await installPackage(baseDir, '@ca-fixture/plain', {});

    await expect(resolvePackageSources(['@ca-fixture/plain'], baseDir)).rejects.toThrow(
      /"@ca-fixture\/plain" declares no CodeAssembly content/,
    );
  });

  it('throws when a package declares a malformed codeassembly content value', async () => {
    await installPackage(baseDir, '@ca-fixture/broken', { codeassembly: { content: 42 } });

    await expect(resolvePackageSources(['@ca-fixture/broken'], baseDir)).rejects.toThrow(
      /"@ca-fixture\/broken" declares an invalid "codeassembly" key/,
    );
  });

  it('throws when a package.json is not valid JSON, naming the package', async () => {
    const dir = path.join(baseDir, 'node_modules', '@ca-fixture', 'malformed');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'package.json'), '{ not json', 'utf8');

    await expect(resolvePackageSources(['@ca-fixture/malformed'], baseDir)).rejects.toThrow(
      /"@ca-fixture\/malformed" has an unreadable package\.json/,
    );
  });
});

describe(findUndeclaredGuidancePackages, () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await makeBaseDir('pkgscan');
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('reports a guidance-shipping dependency the project has not declared', async () => {
    await installPackage(baseDir, '@ca-fixture/ships', { codeassembly: { content: 'c' } });
    await writeProjectManifest(baseDir, { dependencies: { '@ca-fixture/ships': '1.0.0' } });

    expect(await findUndeclaredGuidancePackages([], baseDir)).toEqual(['@ca-fixture/ships']);
  });

  it('reports a guidance-shipping devDependency', async () => {
    await installPackage(baseDir, '@ca-fixture/tooling', { codeassembly: { content: 'c' } });
    await writeProjectManifest(baseDir, { devDependencies: { '@ca-fixture/tooling': '1.0.0' } });

    expect(await findUndeclaredGuidancePackages([], baseDir)).toEqual(['@ca-fixture/tooling']);
  });

  it('stays silent once the package is declared', async () => {
    await installPackage(baseDir, '@ca-fixture/ships', { codeassembly: { content: 'c' } });
    await writeProjectManifest(baseDir, { dependencies: { '@ca-fixture/ships': '1.0.0' } });

    expect(await findUndeclaredGuidancePackages(['@ca-fixture/ships'], baseDir)).toEqual([]);
  });

  it('never reports a dependency that declares no content', async () => {
    await installPackage(baseDir, '@ca-fixture/plain', {});
    await writeProjectManifest(baseDir, { dependencies: { '@ca-fixture/plain': '1.0.0' } });

    expect(await findUndeclaredGuidancePackages([], baseDir)).toEqual([]);
  });

  it('never reports a dependency that is declared but not installed', async () => {
    await writeProjectManifest(baseDir, { dependencies: { '@ca-fixture/absent': '1.0.0' } });

    expect(await findUndeclaredGuidancePackages([], baseDir)).toEqual([]);
  });

  it('sorts the reported names', async () => {
    await installPackage(baseDir, '@ca-fixture/zulu', { codeassembly: { content: 'c' } });
    await installPackage(baseDir, '@ca-fixture/alpha', { codeassembly: { content: 'c' } });
    await writeProjectManifest(baseDir, {
      dependencies: { '@ca-fixture/zulu': '1.0.0' },
      devDependencies: { '@ca-fixture/alpha': '1.0.0' },
    });

    expect(await findUndeclaredGuidancePackages([], baseDir)).toEqual(['@ca-fixture/alpha', '@ca-fixture/zulu']);
  });

  it('reports nothing when the project has no package.json', async () => {
    expect(await findUndeclaredGuidancePackages([], baseDir)).toEqual([]);
  });

  it('reports nothing when the project package.json will not parse', async () => {
    await writeFile(path.join(baseDir, 'package.json'), '{ not json', 'utf8');

    expect(await findUndeclaredGuidancePackages([], baseDir)).toEqual([]);
  });

  it('skips a dependency whose own package.json will not parse rather than failing', async () => {
    const dir = path.join(baseDir, 'node_modules', '@ca-fixture', 'malformed');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'package.json'), '{ not json', 'utf8');
    await installPackage(baseDir, '@ca-fixture/ships', { codeassembly: { content: 'c' } });
    await writeProjectManifest(baseDir, {
      dependencies: { '@ca-fixture/malformed': '1.0.0', '@ca-fixture/ships': '1.0.0' },
    });

    expect(await findUndeclaredGuidancePackages([], baseDir)).toEqual(['@ca-fixture/ships']);
  });
});

// region | Helpers

/**
 * Installs a fixture package under `baseDir`'s `node_modules` and returns its directory. Fixture names are
 * deliberately distinctive: Resolution searches every ancestor `node_modules`, so a common name could resolve against
 * a real package outside the temp tree.
 */
async function installPackage(baseDir: string, name: string, manifest: Record<string, unknown>): Promise<string> {
  const dir = path.join(baseDir, 'node_modules', name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name, ...manifest }), 'utf8');
  return dir;
}

/** Creates a uniquely named temp directory to act as a project root. */
async function makeBaseDir(label: string): Promise<string> {
  const dir = path.join(tmpdir(), `agents-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Writes the consuming project's own `package.json` at `baseDir`. */
async function writeProjectManifest(baseDir: string, manifest: Record<string, unknown>): Promise<void> {
  await writeFile(path.join(baseDir, 'package.json'), JSON.stringify(manifest), 'utf8');
}

// endregion | Helpers
