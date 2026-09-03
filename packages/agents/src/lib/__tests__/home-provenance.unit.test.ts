import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getHomeProvenancePath,
  readHomeProvenance,
  recordFailedHomeAttempt,
  recordHomeProvenance,
} from '../home-provenance.ts';
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
        schemaVersion: 2,
        lastWrite: {
          version: readRunningPackageVersion(),
          sourcePath: resolveRunningPackageRoot(),
          command: 'sync --global',
        },
        lastAttempt: { command: 'sync --global', outcome: 'succeeded' },
      });
      expect(Date.parse(stamp?.lastWrite?.writtenAt ?? '')).not.toBeNaN();
    });

    it('records the source commit when the package sits in a git tree', async () => {
      await recordHomeProvenance('install', homeDir);

      expect((await readHomeProvenance(homeDir))?.lastWrite?.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    });

    it('overwrites the previous stamp, so the newest write is the one reported', async () => {
      await recordHomeProvenance('install', homeDir);
      await recordHomeProvenance('sync --global', homeDir);

      expect((await readHomeProvenance(homeDir))?.lastWrite?.command).toBe('sync --global');
    });

    it('mirrors the write fields at the top level, so a binary predating `lastWrite` still reads the stamp', async () => {
      await recordHomeProvenance('install', homeDir);

      const raw: unknown = JSON.parse(await readFile(getHomeProvenancePath(homeDir), 'utf8'));
      expect(raw).toMatchObject({
        version: readRunningPackageVersion(),
        sourcePath: resolveRunningPackageRoot(),
        command: 'install',
      });
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

  describe(recordFailedHomeAttempt, () => {
    it('records the failed attempt with its summary and defect count', async () => {
      await recordFailedHomeAttempt('sync --global', { summary: 'two rulebooks rejected', defectCount: 2 }, homeDir);

      const stamp = await readHomeProvenance(homeDir);
      expect(stamp?.lastAttempt).toMatchObject({
        command: 'sync --global',
        outcome: 'failed',
        failureSummary: 'two rulebooks rejected',
        defectCount: 2,
      });
      expect(Date.parse(stamp?.lastAttempt?.attemptedAt ?? '')).not.toBeNaN();
    });

    it('keeps the write the stamp already reports, so the deployed guidance stays datable', async () => {
      await recordHomeProvenance('install', homeDir);
      const written = (await readHomeProvenance(homeDir))?.lastWrite;

      await recordFailedHomeAttempt('sync --global', { summary: 'rejected' }, homeDir);

      const stamp = await readHomeProvenance(homeDir);
      expect(stamp?.lastWrite).toEqual(written);
      expect(stamp?.lastAttempt?.outcome).toBe('failed');
    });

    it('records an attempt on a machine that has never been written, rather than nothing', async () => {
      await recordFailedHomeAttempt('install', { summary: 'rejected' }, homeDir);

      const stamp = await readHomeProvenance(homeDir);
      expect(stamp?.lastWrite).toBeUndefined();
      expect(stamp?.lastAttempt?.outcome).toBe('failed');
    });

    it('reports nothing rather than throwing when the stamp cannot be written', async () => {
      await expect(
        recordFailedHomeAttempt('install', { summary: 'rejected' }, path.join(homeDir, 'missing', '\0bad')),
      ).resolves.toBeUndefined();
    });
  });

  describe(readHomeProvenance, () => {
    it("lifts a version-1 stamp's flat fields into `lastWrite`", async () => {
      await writeStamp(
        JSON.stringify({
          schemaVersion: 1,
          version: '0.8.0',
          sourcePath: '/repos/live/packages/agents',
          sourceCommit: 'a'.repeat(40),
          command: 'install',
          writtenAt: '2026-08-09T00:00:00.000Z',
        }),
      );

      const stamp = await readHomeProvenance(homeDir);
      expect(stamp?.lastWrite).toEqual({
        version: '0.8.0',
        sourcePath: '/repos/live/packages/agents',
        sourceCommit: 'a'.repeat(40),
        command: 'install',
        writtenAt: '2026-08-09T00:00:00.000Z',
      });
      expect(stamp?.lastAttempt).toBeUndefined();
    });

    it('reports nothing when no stamp has been written', async () => {
      await expect(readHomeProvenance(homeDir)).resolves.toBeUndefined();
    });

    it('reports nothing for a stamp missing required fields', async () => {
      await writeStamp(JSON.stringify({ schemaVersion: 1 }));

      await expect(readHomeProvenance(homeDir)).resolves.toBeUndefined();
    });

    it('reports nothing for a truncated stamp instead of failing the read', async () => {
      await writeStamp('{"schemaVersion": 1, "version": "0.8.0"');

      await expect(readHomeProvenance(homeDir)).resolves.toBeUndefined();
    });

    it('reports nothing for a stamp naming a command no home write can issue', async () => {
      await writeStamp(
        JSON.stringify({
          schemaVersion: 1,
          version: '0.8.0',
          sourcePath: '/repos/live/packages/agents',
          command: 'uninstall',
          writtenAt: '2026-08-09T00:00:00.000Z',
        }),
      );

      await expect(readHomeProvenance(homeDir)).resolves.toBeUndefined();
    });
  });

  // region | Helpers

  /** Writes `content` to the stamp path verbatim, so a test can plant a shape `recordHomeProvenance` never produces. */
  async function writeStamp(content: string): Promise<void> {
    const provenancePath = getHomeProvenancePath(homeDir);
    await mkdir(path.dirname(provenancePath), { recursive: true });
    await writeFile(provenancePath, content, 'utf8');
  }

  // endregion | Helpers
});
