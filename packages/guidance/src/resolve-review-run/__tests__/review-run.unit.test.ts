import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findActiveRun, findLatestReview, openRun } from '../review-run.ts';

describe('findActiveRun', () => {
  let ticketDir: string;

  beforeEach(async () => {
    ticketDir = await mkdtemp(path.join(tmpdir(), 'review-run-'));
  });

  afterEach(async () => {
    await rm(ticketDir, { force: true, recursive: true });
  });

  it('selects the newest interactive run, skipping a newer orchestrated run', async () => {
    await mkdir(path.join(ticketDir, '20261001-090000Z-interactive'));
    await mkdir(path.join(ticketDir, '20261002-090000Z-interactive'));
    await mkdir(path.join(ticketDir, '20261003-090000Z-orchestrated'));

    expect(await findActiveRun(ticketDir)).toBe(path.join(ticketDir, '20261002-090000Z-interactive'));
  });

  it('returns undefined when the ticket directory contains only orchestrated runs', async () => {
    await mkdir(path.join(ticketDir, '20261003-090000Z-orchestrated'));

    expect(await findActiveRun(ticketDir)).toBeUndefined();
  });

  it('returns undefined when the ticket directory does not exist', async () => {
    expect(await findActiveRun(path.join(ticketDir, 'missing'))).toBeUndefined();
  });
});

describe('findLatestReview', () => {
  let ticketDir: string;

  beforeEach(async () => {
    ticketDir = await mkdtemp(path.join(tmpdir(), 'review-run-'));
  });

  afterEach(async () => {
    await rm(ticketDir, { force: true, recursive: true });
  });

  it('selects the newest review among reviewer and overseer files in the active run', async () => {
    await writeArtifact('20261002-090000Z-interactive', '20261002-090000Z_reviewer_review.md');
    await writeArtifact('20261002-090000Z-interactive', '20261002-110000Z_overseer_review.md');
    await writeArtifact('20261002-090000Z-interactive', '20261002-100000Z_reviewer_review.md');
    await writeArtifact('20261002-090000Z-interactive', '20261002-120000Z_coder_change-summary.md');
    await writeArtifact('20261001-090000Z-interactive', '20261001-130000Z_reviewer_review.md');

    const result = await findLatestReview(ticketDir);

    expect(result).toEqual({
      reviewPath: path.join(ticketDir, '20261002-090000Z-interactive', '20261002-110000Z_overseer_review.md'),
      runDir: path.join(ticketDir, '20261002-090000Z-interactive'),
    });
  });

  it('never selects an orchestrated run, even when it is newer', async () => {
    await writeArtifact('20261001-090000Z-interactive', '20261001-090000Z_reviewer_review.md');
    await writeArtifact('20261003-090000Z-orchestrated', '20261003-090000Z_reviewer_review.md');

    const result = await findLatestReview(ticketDir);

    expect(result.runDir).toBe(path.join(ticketDir, '20261001-090000Z-interactive'));
  });

  it('orders by the timestamp in the name rather than by modification time', async () => {
    const older = await writeArtifact('20261001-090000Z-interactive', '20261001-090000Z_reviewer_review.md');
    await writeArtifact('20261002-090000Z-interactive', '20261002-090000Z_reviewer_review.md');
    await writeArtifact('20261002-090000Z-interactive', '20261002-100000Z_reviewer_review.md');
    const future = new Date('2030-01-01T00:00:00Z');
    await utimes(path.dirname(older), future, future);
    await utimes(
      path.join(ticketDir, '20261002-090000Z-interactive', '20261002-090000Z_reviewer_review.md'),
      future,
      future,
    );

    const result = await findLatestReview(ticketDir);

    expect(result.reviewPath).toBe(
      path.join(ticketDir, '20261002-090000Z-interactive', '20261002-100000Z_reviewer_review.md'),
    );
  });

  it('skips entries whose names do not parse', async () => {
    await writeArtifact('20261001-090000Z-interactive', '20261001-090000Z_reviewer_review.md');
    await writeArtifact('20261001-090000Z-interactive', '99_reviewer_review.md');
    await writeArtifact('prototypes', '20261009-090000Z_reviewer_review.md');
    await writeFile(path.join(ticketDir, '20261009-090000Z-interactive'), '');

    const result = await findLatestReview(ticketDir);

    expect(result.reviewPath).toBe(
      path.join(ticketDir, '20261001-090000Z-interactive', '20261001-090000Z_reviewer_review.md'),
    );
  });

  it('fails naming the newest run when it does not contain a review', async () => {
    await writeArtifact('20261001-090000Z-interactive', '20261001-090000Z_reviewer_review.md');
    const emptyRun = path.join(ticketDir, '20261002-090000Z-interactive');
    await mkdir(emptyRun);

    await expect(findLatestReview(ticketDir)).rejects.toThrow(`no reviewer or overseer review found in ${emptyRun}`);
  });

  it('fails naming the ticket directory when it does not contain an interactive run', async () => {
    await mkdir(path.join(ticketDir, 'prototypes'));
    await mkdir(path.join(ticketDir, '20261003-090000Z-orchestrated'));

    await expect(findLatestReview(ticketDir)).rejects.toThrow(`no interactive run directory found in ${ticketDir}`);
  });

  it('fails naming the ticket directory when the directory does not exist', async () => {
    const missing = path.join(ticketDir, 'missing');

    await expect(findLatestReview(missing)).rejects.toThrow(`no interactive run directory found in ${missing}`);
  });

  // region | Helpers

  /** Writes an empty artifact into a run directory under the ticket directory and returns its path. */
  async function writeArtifact(runDirName: string, fileName: string): Promise<string> {
    const runDir = path.join(ticketDir, runDirName);
    await mkdir(runDir, { recursive: true });
    const filePath = path.join(runDir, fileName);
    await writeFile(filePath, '');
    return filePath;
  }

  // endregion | Helpers
});

describe('openRun', () => {
  let ticketDir: string;

  beforeEach(async () => {
    ticketDir = await mkdtemp(path.join(tmpdir(), 'review-run-'));
  });

  afterEach(async () => {
    await rm(ticketDir, { force: true, recursive: true });
  });

  it('creates the interactive run directory named for the timestamp when no active run exists', async () => {
    await mkdir(path.join(ticketDir, '20261003-090000Z-orchestrated'));

    const runDir = await openRun(ticketDir, '20261004-101500Z');

    expect(runDir).toBe(path.join(ticketDir, '20261004-101500Z-interactive'));
    expect((await stat(runDir)).isDirectory()).toBe(true);
  });

  it('reuses the active run without creating another', async () => {
    const activeRun = path.join(ticketDir, '20261001-090000Z-interactive');
    await mkdir(activeRun);

    const runDir = await openRun(ticketDir, '20261004-101500Z');

    expect(runDir).toBe(activeRun);
    expect(await readdir(ticketDir)).toEqual(['20261001-090000Z-interactive']);
  });

  it('creates a missing ticket directory', async () => {
    const nested = path.join(ticketDir, 'projects', 'acme', 'tickets', '7');

    const runDir = await openRun(nested, '20261004-101500Z');

    expect((await stat(runDir)).isDirectory()).toBe(true);
  });

  it.each(['20261004-1015Z', '20261004T101500Z', '20261004-101500', '2026-10-04'])(
    'rejects the malformed timestamp %s without creating anything',
    async (timestamp) => {
      await expect(openRun(ticketDir, timestamp)).rejects.toThrow('YYYYMMDD-HHMMSSZ');
      expect(await readdir(ticketDir)).toEqual([]);
    },
  );

  it('rejects a malformed timestamp when an active run exists', async () => {
    await mkdir(path.join(ticketDir, '20261001-090000Z-interactive'));

    await expect(openRun(ticketDir, '2026-10-04')).rejects.toThrow('YYYYMMDD-HHMMSSZ');
  });
});
