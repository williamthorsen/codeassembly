import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendReviewMarker,
  appendSnapshot,
  PRUNE_THRESHOLD_BYTES,
  pruneRecord,
  RETAINED_LINES,
} from '../append-snapshot.ts';
import {
  parseReviewMarkerLine,
  parseSnapshotLine,
  REVIEW_MARKER_SCHEMA_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
} from '../schema.ts';
import type { ReviewMarker, SizeSnapshot } from '../types.ts';

describe(pruneRecord, () => {
  let recordDir: string;
  let recordPath: string;

  beforeEach(async () => {
    recordDir = await mkdtemp(path.join(tmpdir(), 'append-snapshot-'));
    recordPath = path.join(recordDir, 'owner', 'name.jsonl');
  });

  afterEach(async () => {
    await rm(recordDir, { recursive: true, force: true });
  });

  it('caps the record at the retained count, keeping the most recent snapshots', async () => {
    for (let i = 1; i <= RETAINED_LINES + 10; i++) {
      await appendSnapshot(recordPath, buildSnapshot(i));
    }

    await pruneRecord(recordPath);

    const totals = await readTotals(recordPath);
    expect(totals.length).toBe(RETAINED_LINES);
    expect(totals.at(0)).toBe(11);
    expect(totals.at(-1)).toBe(RETAINED_LINES + 10);
  });

  it('leaves a record shorter than the retained count whole', async () => {
    await appendSnapshot(recordPath, buildSnapshot(1));
    await appendSnapshot(recordPath, buildSnapshot(2));

    await pruneRecord(recordPath);

    expect(await readTotals(recordPath)).toEqual([1, 2]);
  });
});

describe(appendReviewMarker, () => {
  let recordDir: string;
  let recordPath: string;

  beforeEach(async () => {
    recordDir = await mkdtemp(path.join(tmpdir(), 'append-snapshot-'));
    recordPath = path.join(recordDir, 'owner', 'name.jsonl');
  });

  afterEach(async () => {
    await rm(recordDir, { recursive: true, force: true });
  });

  it('round-trips a marker through the record', async () => {
    const marker = buildMarker(['skills/plan/SKILL.md']);

    await appendReviewMarker(recordPath, marker);

    expect(await readMarkers(recordPath)).toEqual([marker]);
  });

  it('writes a marker that a reader of snapshots skips', async () => {
    await appendReviewMarker(recordPath, buildMarker(['skills/plan/SKILL.md']));

    const [line] = (await readFile(recordPath, 'utf8')).split('\n', 1);

    expect(parseSnapshotLine(line ?? '')).toBeUndefined();
  });
});

describe(appendSnapshot, () => {
  let recordDir: string;
  let recordPath: string;

  beforeEach(async () => {
    recordDir = await mkdtemp(path.join(tmpdir(), 'append-snapshot-'));
    recordPath = path.join(recordDir, 'owner', 'name.jsonl');
  });

  afterEach(async () => {
    await rm(recordDir, { recursive: true, force: true });
  });

  // A deployment whose lines are large enough for the retained count to exceed the threshold. Without the byte bound
  // the prune would return a record still over it, leaving every later append to prune again.
  it('prunes to under the threshold when the retained count alone would leave the record over it', async () => {
    const bulky = buildBulkySnapshot();
    const lineBytes = Buffer.byteLength(`${JSON.stringify(bulky)}\n`, 'utf8');
    // States that the count limit is not what bounds this record: the byte limit is.
    expect(lineBytes * RETAINED_LINES).toBeGreaterThan(PRUNE_THRESHOLD_BYTES);
    const appends = Math.ceil(PRUNE_THRESHOLD_BYTES / lineBytes) + 1;

    for (let appended = 0; appended < appends; appended++) {
      await appendSnapshot(recordPath, bulky);
    }

    expect((await stat(recordPath)).size).toBeLessThanOrEqual(PRUNE_THRESHOLD_BYTES);
    expect((await readTotals(recordPath)).length).toBeLessThan(appends);
  });
});

// region | Helpers

/**
 * A snapshot of a deployment large enough that `RETAINED_LINES` of its lines weigh more than the threshold,
 * which is the case the byte bound exists for.
 */
function buildBulkySnapshot(): SizeSnapshot {
  const files: Record<string, { bytes: number; kind: 'document' }> = {};
  for (let i = 0; i < 600; i++) {
    files[`claude/skills/consult-some-deployed-skill-${i}/SKILL.md`] = { bytes: 4_096, kind: 'document' };
  }
  return { ...buildSnapshot(1), files };
}

/** A review marker naming the given content-root-relative documents. */
function buildMarker(reviewed: ReadonlyArray<string>): ReviewMarker {
  return {
    schemaVersion: REVIEW_MARKER_SCHEMA_VERSION,
    kind: 'review',
    recordedAt: '2026-09-19T08:00:00.000Z',
    reviewed,
  };
}

/** A snapshot whose on-invocation total identifies it within a record. */
function buildSnapshot(onInvocation: number): SizeSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    kind: 'snapshot',
    recordedAt: '2026-09-19T08:00:00.000Z',
    version: '0.15.0',
    files: { 'claude/skills/plan/SKILL.md': { bytes: onInvocation, kind: 'document' } },
    aggregates: {
      alwaysLoaded: { total: 0, ambientRegions: 0, skillDescriptions: 0, subagentDescriptions: 0 },
      onInvocation,
      assets: 0,
    },
  };
}

/** Every line the record holds parsed as a review marker, in the order that it holds them. */
async function readMarkers(recordPath: string): Promise<ReadonlyArray<ReviewMarker | undefined>> {
  const raw = await readFile(recordPath, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => parseReviewMarkerLine(line));
}

/** The on-invocation total of every line the record holds, in the order that it holds them. */
async function readTotals(recordPath: string): Promise<ReadonlyArray<number>> {
  const raw = await readFile(recordPath, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => parseSnapshotLine(line)?.aggregates.onInvocation ?? NaN);
}

// endregion | Helpers
