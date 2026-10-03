import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendSnapshot } from '../append-snapshot.ts';
import { readRecordLines, selectLatestSnapshot } from '../read-record.ts';
import { SNAPSHOT_SCHEMA_VERSION } from '../schema.ts';
import type { SizeSnapshot } from '../types.ts';

/** A review-marker line as earlier versions appended it to the record, which a current reader must skip. */
const LEGACY_REVIEW_MARKER = {
  schemaVersion: 1,
  kind: 'review',
  recordedAt: '2026-09-19T09:00:00.000Z',
  reviewed: ['skills/plan/SKILL.md'],
};

describe(readRecordLines, () => {
  let recordDir: string;
  let recordPath: string;

  beforeEach(async () => {
    recordDir = await mkdtemp(path.join(tmpdir(), 'deployed-sizes-'));
    recordPath = path.join(recordDir, 'owner', 'name.jsonl');
  });

  afterEach(async () => {
    await rm(recordDir, { recursive: true, force: true });
  });

  it('returns no lines when the record has never been written', async () => {
    expect(await readRecordLines(recordPath)).toEqual([]);
  });

  it('drops the trailing empty line that every append leaves', async () => {
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 10 }));

    expect((await readRecordLines(recordPath)).length).toBe(1);
  });
});

describe(selectLatestSnapshot, () => {
  let recordDir: string;
  let recordPath: string;

  beforeEach(async () => {
    recordDir = await mkdtemp(path.join(tmpdir(), 'deployed-sizes-'));
    recordPath = path.join(recordDir, 'owner', 'name.jsonl');
  });

  afterEach(async () => {
    await rm(recordDir, { recursive: true, force: true });
  });

  it('returns undefined when the record has never been written', async () => {
    expect(selectLatestSnapshot(await readRecordLines(recordPath))).toBeUndefined();
  });

  it('returns the only snapshot in a one-line record', async () => {
    const snapshot = buildSnapshot({ onInvocation: 10 });
    await appendSnapshot(recordPath, snapshot);

    expect(selectLatestSnapshot(await readRecordLines(recordPath))).toEqual(snapshot);
  });

  it('returns the last snapshot when the record holds several', async () => {
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 10 }));
    const latest = buildSnapshot({ onInvocation: 20 });
    await appendSnapshot(recordPath, latest);

    expect(selectLatestSnapshot(await readRecordLines(recordPath))).toEqual(latest);
  });

  it('reads the last well-formed snapshot past a truncated final line', async () => {
    const latest = buildSnapshot({ onInvocation: 10 });
    await appendSnapshot(recordPath, latest);
    await writeFile(recordPath, `${JSON.stringify(latest)}\n{"schemaVersion":1,"kind":"snap`, { flag: 'w' });

    expect(selectLatestSnapshot(await readRecordLines(recordPath))).toEqual(latest);
  });

  it('reads past a review-marker line that an earlier version wrote between snapshots', async () => {
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 10 }));
    await writeFile(recordPath, `${JSON.stringify(LEGACY_REVIEW_MARKER)}\n`, { flag: 'a' });
    const latest = buildSnapshot({ onInvocation: 20 });
    await appendSnapshot(recordPath, latest);
    await writeFile(recordPath, `${JSON.stringify(LEGACY_REVIEW_MARKER)}\n`, { flag: 'a' });

    expect(selectLatestSnapshot(await readRecordLines(recordPath))).toEqual(latest);
  });

  it('returns undefined when no line in the record parses as a snapshot', async () => {
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 10 }));
    await writeFile(recordPath, 'not json at all\n', { flag: 'w' });

    expect(selectLatestSnapshot(await readRecordLines(recordPath))).toBeUndefined();
  });
});

// region | Helpers

/** Builds a snapshot whose on-invocation total distinguishes it from its neighbors in a record. */
function buildSnapshot(overrides: { onInvocation: number; recordedAt?: string }): SizeSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    kind: 'snapshot',
    recordedAt: overrides.recordedAt ?? '2026-09-19T08:00:00.000Z',
    version: '0.15.0',
    files: { 'skills/plan/SKILL.md': { bytes: overrides.onInvocation, kind: 'document' } },
    aggregates: {
      alwaysLoaded: { total: 0, ambientRegions: 0, skillDescriptions: 0, subagentDescriptions: 0 },
      onInvocation: overrides.onInvocation,
      assets: 0,
    },
  };
}

// endregion | Helpers
