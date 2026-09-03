import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getHomeProvenancePath, readHomeProvenance } from '../../lib/home-provenance.ts';
import { getManifestPath, readManifest } from '../../lib/manifest.ts';
import { readRunningPackageVersion } from '../../lib/running-package.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { installCommand } from '../install.ts';
import { buildContentTree } from '../test-utils/build-content-tree.ts';

describe('install (home provenance)', () => {
  let tempDir: string;
  let contentDir: string;

  beforeEach(async () => {
    tempDir = path.join(
      tmpdir(),
      `agents-test-install-provenance-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    contentDir = path.join(tempDir, 'content');
    await mkdir(path.join(tempDir, '.claude', 'skills'), { recursive: true });
    await buildContentTree(contentDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function makeOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
    return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
  }

  it('stamps the run it completed', async () => {
    await installCommand(makeOptions(), tempDir, contentDir);

    expect(await readHomeProvenance(tempDir)).toMatchObject({ command: 'install' });
  });

  it('stamps a run that detects no harness but still writes shared guidance', async () => {
    await rm(path.join(tempDir, '.claude'), { recursive: true, force: true });

    await installCommand(makeOptions({ harness: 'all' }), tempDir, contentDir);

    expect(await readHomeProvenance(tempDir)).toMatchObject({ command: 'install' });
  });

  it('leaves the stamp untouched on a dry run', async () => {
    await installCommand(makeOptions({ dryRun: true }), tempDir, contentDir);

    expect(existsSync(getHomeProvenancePath(tempDir))).toBe(false);
  });

  it('records the failed attempt when the run cannot deploy, keeping any earlier write', async () => {
    await installCommand(makeOptions(), tempDir, contentDir);
    const written = (await readHomeProvenance(tempDir))?.lastWrite;
    await mkdir(path.join(tempDir, '.agents'), { recursive: true });
    await writeFile(path.join(tempDir, '.agents', 'not-a-dir'), 'not a dir\n', 'utf8');
    await writeFile(
      path.join(tempDir, '.agents', 'codeassembly.yaml'),
      'sources:\n  - name: bad-source\n    path: ./not-a-dir\n',
      'utf8',
    );

    await expect(installCommand(makeOptions(), tempDir, contentDir)).rejects.toThrow(/bad-source/);

    const stamp = await readHomeProvenance(tempDir);
    expect(stamp?.lastAttempt).toMatchObject({ command: 'install', outcome: 'failed' });
    expect(stamp?.lastWrite).toEqual(written);
  });

  it('records the running package version in the harness manifest', async () => {
    await installCommand(makeOptions(), tempDir, contentDir);

    const manifest = await readManifest(getManifestPath(tempDir));
    expect(manifest.harnesses.claude?.version).toBe(readRunningPackageVersion());
  });
});
