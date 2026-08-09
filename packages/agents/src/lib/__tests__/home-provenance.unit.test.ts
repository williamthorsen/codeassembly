import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getHomeProvenancePath, readHomeProvenance, recordHomeProvenance } from '../home-provenance.ts';
import { getManifestPath } from '../manifest.ts';
import { readRunningPackageVersion, resolveRunningPackageRoot } from '../running-package.ts';

describe('home provenance', () => {
  let homeDir: string;

  beforeEach(async () => {
    homeDir = path.join(tmpdir(), `agents-test-provenance-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(homeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  describe(getHomeProvenancePath, () => {
    it('places the stamp beside the install manifest', () => {
      expect(path.dirname(getHomeProvenancePath(homeDir))).toBe(path.dirname(getManifestPath(homeDir)));
    });
  });

  describe(recordHomeProvenance, () => {
    it('records the running package, the command, and a timestamp', async () => {
      await recordHomeProvenance('sync --global', homeDir);

      const stamp = await readHomeProvenance(homeDir);
      expect(stamp).toMatchObject({
        schemaVersion: 1,
        version: readRunningPackageVersion(),
        sourcePath: resolveRunningPackageRoot(),
        command: 'sync --global',
      });
      expect(Date.parse(stamp?.writtenAt ?? '')).not.toBeNaN();
    });

    it('records the source commit when the package sits in a git tree', async () => {
      await recordHomeProvenance('install', homeDir);

      expect((await readHomeProvenance(homeDir))?.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    });

    it('overwrites the previous stamp, so the newest write is the one reported', async () => {
      await recordHomeProvenance('install', homeDir);
      await recordHomeProvenance('sync --global', homeDir);

      expect((await readHomeProvenance(homeDir))?.command).toBe('sync --global');
    });

    it('writes valid JSON with a trailing newline', async () => {
      await recordHomeProvenance('install', homeDir);

      const raw = await readFile(getHomeProvenancePath(homeDir), 'utf8');
      expect(raw.endsWith('\n')).toBe(true);
      expect(() => {
        JSON.parse(raw);
      }).not.toThrow();
    });
  });

  describe(readHomeProvenance, () => {
    it('reports nothing when no stamp has been written', async () => {
      await expect(readHomeProvenance(homeDir)).resolves.toBeUndefined();
    });

    it('reports nothing for a stamp missing required fields', async () => {
      const provenancePath = getHomeProvenancePath(homeDir);
      await mkdir(path.dirname(provenancePath), { recursive: true });
      await writeFile(provenancePath, JSON.stringify({ schemaVersion: 1 }), 'utf8');

      await expect(readHomeProvenance(homeDir)).resolves.toBeUndefined();
    });
  });
});
