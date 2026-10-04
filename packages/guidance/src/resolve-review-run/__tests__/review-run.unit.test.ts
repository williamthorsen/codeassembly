import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRun, findLatestReview } from '../review-run.ts';

describe('createRun', () => {
  let ticketDir: string;

  beforeEach(async () => {
    ticketDir = await mkdtemp(path.join(tmpdir(), 'review-run-'));
  });

  afterEach(async () => {
    await rm(ticketDir, { force: true, recursive: true });
  });

  it('creates the interactive run directory named for the timestamp', async () => {
    const runDir = await createRun(ticketDir, '20261004-101500Z');

    expect(runDir).toBe(path.join(ticketDir, '20261004-101500Z-interactive'));
    expect((await stat(runDir)).isDirectory()).toBe(true);
  });

  it('creates a missing ticket directory', async () => {
    const nested = path.join(ticketDir, 'projects', 'acme', 'tickets', '7');

    const runDir = await createRun(nested, '20261004-101500Z');

    expect((await stat(runDir)).isDirectory()).toBe(true);
  });

  it.each(['20261004-1015Z', '20261004T101500Z', '20261004-101500', '2026-10-04'])(
    'rejects the malformed timestamp %s without creating anything',
    async (timestamp) => {
      await expect(createRun(ticketDir, timestamp)).rejects.toThrow('YYYYMMDD-HHMMSSZ');
      expect(await readdir(ticketDir)).toEqual([]);
    },
  );
});

describe('findLatestReview', () => {
  let ticketDir: string;

  beforeEach(async () => {
    ticketDir = await mkdtemp(path.join(tmpdir(), 'review-run-'));
  });

  afterEach(async () => {
    await rm(ticketDir, { force: true, recursive: true });
  });

  it('selects the newest run and its newest review among reviewer and overseer files', async () => {
    await writeArtifact('20261001-090000Z-interactive', '20261001-090000Z_reviewer_review.md');
    await writeArtifact('20261003-090000Z-orchestrated', '20261003-090000Z_reviewer_review.md');
    await writeArtifact('20261003-090000Z-orchestrated', '20261003-110000Z_overseer_review.md');
    await writeArtifact('20261003-090000Z-orchestrated', '20261003-100000Z_reviewer_review.md');
    await writeArtifact('20261003-090000Z-orchestrated', '20261003-120000Z_coder_change-summary.md');

    const result = await findLatestReview(ticketDir);

    expect(result).toEqual({
      reviewPath: path.join(ticketDir, '20261003-090000Z-orchestrated', '20261003-110000Z_overseer_review.md'),
      runDir: path.join(ticketDir, '20261003-090000Z-orchestrated'),
    });
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

  it('fails naming the ticket directory when it does not contain a run', async () => {
    await mkdir(path.join(ticketDir, 'prototypes'));

    await expect(findLatestReview(ticketDir)).rejects.toThrow(`no run directory found in ${ticketDir}`);
  });

  it('fails naming the ticket directory when the directory does not exist', async () => {
    const missing = path.join(ticketDir, 'missing');

    await expect(findLatestReview(missing)).rejects.toThrow(`no run directory found in ${missing}`);
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
