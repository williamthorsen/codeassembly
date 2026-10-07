import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findInstalledPackage } from '../find-installed-package.ts';

describe(findInstalledPackage, () => {
  let root: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'agents-find-installed-package-')));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds a package in an ancestor node_modules and reports its version', async () => {
    const packageDir = await writePackage(path.join(root, 'node_modules', '@scope', 'alpha'), '@scope/alpha', '1.2.3');
    const startDir = path.join(root, 'packages', 'consumer', 'src');
    await mkdir(startDir, { recursive: true });

    await expect(findInstalledPackage('@scope/alpha', startDir)).resolves.toEqual({
      directory: packageDir,
      version: '1.2.3',
    });
  });

  it('follows a pnpm symlink so that a search from the result finds its sibling dependency', async () => {
    const storeModules = path.join(root, 'node_modules', '.pnpm', '@scope+alpha@1.0.0', 'node_modules');
    const alphaDir = await writePackage(path.join(storeModules, '@scope', 'alpha'), '@scope/alpha', '1.0.0');
    await writePackage(path.join(storeModules, '@scope', 'beta'), '@scope/beta', '0.4.0');
    await mkdir(path.join(root, 'node_modules', '@scope'), { recursive: true });
    await symlink(alphaDir, path.join(root, 'node_modules', '@scope', 'alpha'));

    const alpha = await findInstalledPackage('@scope/alpha', root);
    const beta = await findInstalledPackage('@scope/beta', alpha.directory);

    expect(alpha.directory).toBe(alphaDir);
    expect(beta.version).toBe('0.4.0');
  });

  it('skips a package.json that names another package', async () => {
    await writePackage(path.join(root, 'a', 'node_modules', '@scope', 'alpha'), '@scope/impostor', '9.9.9');
    await writePackage(path.join(root, 'node_modules', '@scope', 'alpha'), '@scope/alpha', '2.0.0');

    const found = await findInstalledPackage('@scope/alpha', path.join(root, 'a'));

    expect(found.version).toBe('2.0.0');
  });

  it('throws an error naming the package when no ancestor contains it', async () => {
    await expect(findInstalledPackage('@scope/absent', root)).rejects.toThrow('@scope/absent');
  });
});

// region | Helpers

/** Writes a minimal `package.json` into `packageDir` and returns the directory. */
async function writePackage(packageDir: string, name: string, version: string): Promise<string> {
  await mkdir(packageDir, { recursive: true });
  await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name, version }), 'utf8');
  return packageDir;
}

// endregion | Helpers
