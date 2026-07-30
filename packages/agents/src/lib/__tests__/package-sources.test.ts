import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolvePackageSources } from '../package-sources.ts';

describe(resolvePackageSources, () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = path.join(tmpdir(), `agents-test-pkgsrc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(baseDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  /**
   * Installs a fixture package under `baseDir`'s `node_modules` and returns its directory. Fixture names are
   * deliberately distinctive: resolution searches every ancestor `node_modules`, so a common name could resolve
   * against a real package outside the temp tree.
   */
  async function installPackage(name: string, manifest: Record<string, unknown>): Promise<string> {
    const dir = path.join(baseDir, 'node_modules', name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name, ...manifest }), 'utf8');
    return dir;
  }

  it('resolves an unscoped package to its declared content directory', async () => {
    const dir = await installPackage('ca-fixture-unscoped', { codeassembly: { content: 'codeassembly' } });

    expect(await resolvePackageSources(['ca-fixture-unscoped'], baseDir)).toEqual([
      { name: 'ca-fixture-unscoped', dir: path.join(dir, 'codeassembly') },
    ]);
  });

  it('resolves a scoped package to a content directory nested under one it already owns', async () => {
    const dir = await installPackage('@ca-fixture/nmr', { codeassembly: { content: 'content/agents' } });

    expect(await resolvePackageSources(['@ca-fixture/nmr'], baseDir)).toEqual([
      { name: '@ca-fixture/nmr', dir: path.join(dir, 'content', 'agents') },
    ]);
  });

  it('resolves a package that ships no JavaScript at all', async () => {
    const dir = await installPackage('@ca-fixture/guidance-only', { codeassembly: { content: 'guidance' } });

    expect(await resolvePackageSources(['@ca-fixture/guidance-only'], baseDir)).toEqual([
      { name: '@ca-fixture/guidance-only', dir: path.join(dir, 'guidance') },
    ]);
  });

  it('preserves declaration order rather than sorting', async () => {
    await installPackage('@ca-fixture/beta', { codeassembly: { content: 'c' } });
    await installPackage('@ca-fixture/alpha', { codeassembly: { content: 'c' } });

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

  it('throws when a package declares no codeassembly content', async () => {
    await installPackage('@ca-fixture/plain', {});

    await expect(resolvePackageSources(['@ca-fixture/plain'], baseDir)).rejects.toThrow(
      /"@ca-fixture\/plain" declares no CodeAssembly content/,
    );
  });

  it('throws when a package declares a malformed codeassembly content value', async () => {
    await installPackage('@ca-fixture/broken', { codeassembly: { content: 42 } });

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
