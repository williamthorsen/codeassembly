import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendReviewMarker, appendSnapshot } from '../append-snapshot.ts';
import {
  findSnapshotAfter,
  findSnapshotAtOrBefore,
  listReviewMarkers,
  readRecordLines,
  selectLatestSnapshot,
} from '../read-record.ts';
import { REVIEW_MARKER_SCHEMA_VERSION, SNAPSHOT_SCHEMA_VERSION } from '../schema.ts';
import type { ReviewMarker, SizeSnapshot } from '../types.ts';

describe(findSnapshotAfter, () => {
  let recordDir: string;
  let recordPath: string;

  beforeEach(async () => {
    recordDir = await mkdtemp(path.join(tmpdir(), 'deployed-sizes-'));
    recordPath = path.join(recordDir, 'owner', 'name.jsonl');
  });

  afterEach(async () => {
    await rm(recordDir, { recursive: true, force: true });
  });

  it('returns the first snapshot recorded after the instant', async () => {
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 10, recordedAt: '2026-09-01T00:00:00.000Z' }));
    const first = buildSnapshot({ onInvocation: 20, recordedAt: '2026-09-10T00:00:00.000Z' });
    await appendSnapshot(recordPath, first);
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 30, recordedAt: '2026-09-20T00:00:00.000Z' }));

    expect(findSnapshotAfter(await readRecordLines(recordPath), '2026-09-05T00:00:00.000Z')).toEqual(first);
  });

  it('excludes a snapshot standing on the instant', async () => {
    const onTheInstant = buildSnapshot({ onInvocation: 10, recordedAt: '2026-09-10T00:00:00.000Z' });
    await appendSnapshot(recordPath, onTheInstant);
    const later = buildSnapshot({ onInvocation: 20, recordedAt: '2026-09-11T00:00:00.000Z' });
    await appendSnapshot(recordPath, later);

    expect(findSnapshotAfter(await readRecordLines(recordPath), '2026-09-10T00:00:00.000Z')).toEqual(later);
  });

  it('returns undefined when every snapshot precedes the instant', async () => {
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 10, recordedAt: '2026-09-01T00:00:00.000Z' }));

    expect(findSnapshotAfter(await readRecordLines(recordPath), '2026-09-10T00:00:00.000Z')).toBeUndefined();
  });

  it('returns undefined for an instant that is not a timestamp', async () => {
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 10, recordedAt: '2026-09-10T00:00:00.000Z' }));

    expect(findSnapshotAfter(await readRecordLines(recordPath), 'whenever')).toBeUndefined();
  });

  it('skips a review marker standing after the instant', async () => {
    await appendReviewMarker(recordPath, buildMarker('2026-09-11T00:00:00.000Z', ['skills/plan/SKILL.md']));
    const later = buildSnapshot({ onInvocation: 20, recordedAt: '2026-09-12T00:00:00.000Z' });
    await appendSnapshot(recordPath, later);

    expect(findSnapshotAfter(await readRecordLines(recordPath), '2026-09-10T00:00:00.000Z')).toEqual(later);
  });
});

describe(findSnapshotAtOrBefore, () => {
  let recordDir: string;
  let recordPath: string;

  beforeEach(async () => {
    recordDir = await mkdtemp(path.join(tmpdir(), 'deployed-sizes-'));
    recordPath = path.join(recordDir, 'owner', 'name.jsonl');
  });

  afterEach(async () => {
    await rm(recordDir, { recursive: true, force: true });
  });

  it('returns the newest snapshot at or before the instant', async () => {
    const early = buildSnapshot({ onInvocation: 10, recordedAt: '2026-09-01T00:00:00.000Z' });
    const onTheInstant = buildSnapshot({ onInvocation: 20, recordedAt: '2026-09-10T00:00:00.000Z' });
    await appendSnapshot(recordPath, early);
    await appendSnapshot(recordPath, onTheInstant);
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 30, recordedAt: '2026-09-20T00:00:00.000Z' }));

    const lines = await readRecordLines(recordPath);

    expect(findSnapshotAtOrBefore(lines, '2026-09-10T00:00:00.000Z')).toEqual(onTheInstant);
    expect(findSnapshotAtOrBefore(lines, '2026-09-05T00:00:00.000Z')).toEqual(early);
  });

  it('returns undefined for an instant preceding every surviving snapshot', async () => {
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 10, recordedAt: '2026-09-10T00:00:00.000Z' }));

    const lines = await readRecordLines(recordPath);

    expect(findSnapshotAtOrBefore(lines, '2026-09-01T00:00:00.000Z')).toBeUndefined();
  });

  it('returns undefined for an instant that is not a timestamp', async () => {
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 10, recordedAt: '2026-09-10T00:00:00.000Z' }));

    const lines = await readRecordLines(recordPath);

    expect(findSnapshotAtOrBefore(lines, 'whenever')).toBeUndefined();
  });

  it('skips a review marker standing at the instant', async () => {
    const snapshot = buildSnapshot({ onInvocation: 10, recordedAt: '2026-09-10T00:00:00.000Z' });
    await appendSnapshot(recordPath, snapshot);
    await appendReviewMarker(recordPath, buildMarker('2026-09-11T00:00:00.000Z', ['skills/plan/SKILL.md']));

    const lines = await readRecordLines(recordPath);

    expect(findSnapshotAtOrBefore(lines, '2026-09-11T00:00:00.000Z')).toEqual(snapshot);
  });
});

describe(listReviewMarkers, () => {
  let recordDir: string;
  let recordPath: string;

  beforeEach(async () => {
    recordDir = await mkdtemp(path.join(tmpdir(), 'deployed-sizes-'));
    recordPath = path.join(recordDir, 'owner', 'name.jsonl');
  });

  afterEach(async () => {
    await rm(recordDir, { recursive: true, force: true });
  });

  it('returns the markers in the order that the record holds them', async () => {
    const first = buildMarker('2026-09-10T00:00:00.000Z', ['skills/plan/SKILL.md']);
    const second = buildMarker('2026-09-12T00:00:00.000Z', ['guidance/rulebooks/anti-patterns.md']);
    await appendReviewMarker(recordPath, first);
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 10 }));
    await appendReviewMarker(recordPath, second);

    expect(listReviewMarkers(await readRecordLines(recordPath))).toEqual([first, second]);
  });

  it('returns none for a record carrying no marker', async () => {
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 10 }));

    expect(listReviewMarkers(await readRecordLines(recordPath))).toEqual([]);
  });
});

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

  it('reads past a line whose kind is not snapshot', async () => {
    const latest = buildSnapshot({ onInvocation: 10 });
    await appendSnapshot(recordPath, latest);
    await appendReviewMarker(recordPath, buildMarker('2026-09-19T09:00:00.000Z', ['skills/plan/SKILL.md']));

    expect(selectLatestSnapshot(await readRecordLines(recordPath))).toEqual(latest);
  });

  it('returns undefined when no line in the record parses as a snapshot', async () => {
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 10 }));
    await writeFile(recordPath, 'not json at all\n', { flag: 'w' });

    expect(selectLatestSnapshot(await readRecordLines(recordPath))).toBeUndefined();
  });
});

// region | Helpers

/** A review marker recorded at the given instant, naming the given content-root-relative documents. */
function buildMarker(recordedAt: string, reviewed: ReadonlyArray<string>): ReviewMarker {
  return { schemaVersion: REVIEW_MARKER_SCHEMA_VERSION, kind: 'review', recordedAt, reviewed };
}

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
