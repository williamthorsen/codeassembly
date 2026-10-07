import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findInstalledPackage, listCandidateDirs } from '../find-installed-package.ts';

describe(findInstalledPackage, () => {
  let root: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'agents-find-installed-package-')));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds a package in an ancestor node_modules and returns its parsed manifest', async () => {
    const packageDir = await writePackage(path.join(root, 'node_modules', '@scope', 'alpha'), '{"version":"1.2.3"}');
    const startDir = path.join(root, 'packages', 'consumer', 'src');
    await mkdir(startDir, { recursive: true });

    await expect(findInstalledPackage('@scope/alpha', startDir)).resolves.toEqual({
      directory: packageDir,
      manifest: { version: '1.2.3' },
    });
  });

  it('returns the probed path of a symlinked package, not its real path', async () => {
    const realDir = await writePackage(path.join(root, 'store', 'alpha'), '{}');
    await mkdir(path.join(root, 'node_modules', '@scope'), { recursive: true });
    const linkDir = path.join(root, 'node_modules', '@scope', 'alpha');
    await symlink(realDir, linkDir);

    const found = await findInstalledPackage('@scope/alpha', root);

    expect(found?.directory).toBe(linkDir);
  });

  it('returns undefined when no candidate directory contains the package', async () => {
    await expect(findInstalledPackage('@scope/absent', root)).resolves.toBeUndefined();
  });

  it('names the package when its package.json does not parse', async () => {
    await writePackage(path.join(root, 'node_modules', '@scope', 'broken'), '{');

    await expect(findInstalledPackage('@scope/broken', root)).rejects.toThrow('"@scope/broken"');
  });
});

describe(listCandidateDirs, () => {
  it('lists the nearest node_modules first', () => {
    const candidates = listCandidateDirs('@scope/alpha', path.join(path.sep, 'a', 'b'));

    expect(candidates[0]).toBe(path.join(path.sep, 'a', 'b', 'node_modules', '@scope', 'alpha'));
  });
});

// region | Helpers

/** Writes `manifest` as the `package.json` of `packageDir` and returns the directory. */
async function writePackage(packageDir: string, manifest: string): Promise<string> {
  await mkdir(packageDir, { recursive: true });
  await writeFile(path.join(packageDir, 'package.json'), manifest, 'utf8');
  return packageDir;
}

// endregion | Helpers
