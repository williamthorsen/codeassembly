import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendSnapshot, pruneRecord, RETAINED_SNAPSHOTS } from '../append-snapshot.ts';
import { parseSnapshotLine, SNAPSHOT_SCHEMA_VERSION } from '../schema.ts';
import type { SizeSnapshot } from '../types.ts';

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
    for (let i = 1; i <= RETAINED_SNAPSHOTS + 10; i++) {
      await appendSnapshot(recordPath, buildSnapshot(i));
    }

    await pruneRecord(recordPath);

    const totals = await readTotals(recordPath);
    expect(totals.length).toBe(RETAINED_SNAPSHOTS);
    expect(totals.at(0)).toBe(11);
    expect(totals.at(-1)).toBe(RETAINED_SNAPSHOTS + 10);
  });

  it('leaves a record shorter than the retained count whole', async () => {
    await appendSnapshot(recordPath, buildSnapshot(1));
    await appendSnapshot(recordPath, buildSnapshot(2));

    await pruneRecord(recordPath);

    expect(await readTotals(recordPath)).toEqual([1, 2]);
  });
});

// region | Helpers

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

/** The on-invocation total of every line the record holds, in the order that it holds them. */
async function readTotals(recordPath: string): Promise<ReadonlyArray<number>> {
  const raw = await readFile(recordPath, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => parseSnapshotLine(line)?.aggregates.onInvocation ?? NaN);
}

// endregion | Helpers
