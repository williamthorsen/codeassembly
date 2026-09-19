import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendSnapshot } from '../append-snapshot.ts';
import { readLatestSnapshot } from '../read-record.ts';
import { SNAPSHOT_SCHEMA_VERSION } from '../schema.ts';
import type { SizeSnapshot } from '../types.ts';

describe(readLatestSnapshot, () => {
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
    expect(await readLatestSnapshot(recordPath)).toBeUndefined();
  });

  it('returns the only snapshot in a one-line record', async () => {
    const snapshot = buildSnapshot({ onInvocation: 10 });
    await appendSnapshot(recordPath, snapshot);

    expect(await readLatestSnapshot(recordPath)).toEqual(snapshot);
  });

  it('returns the last snapshot when the record holds several', async () => {
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 10 }));
    const latest = buildSnapshot({ onInvocation: 20 });
    await appendSnapshot(recordPath, latest);

    expect(await readLatestSnapshot(recordPath)).toEqual(latest);
  });

  it('reads the last well-formed snapshot past a truncated final line', async () => {
    const latest = buildSnapshot({ onInvocation: 10 });
    await appendSnapshot(recordPath, latest);
    await writeFile(recordPath, `${JSON.stringify(latest)}\n{"schemaVersion":1,"kind":"snap`, { flag: 'w' });

    expect(await readLatestSnapshot(recordPath)).toEqual(latest);
  });

  it('reads past a line whose kind is not snapshot', async () => {
    const latest = buildSnapshot({ onInvocation: 10 });
    await appendSnapshot(recordPath, latest);
    await writeFile(recordPath, `${JSON.stringify({ schemaVersion: 1, kind: 'review' })}\n`, { flag: 'a' });

    expect(await readLatestSnapshot(recordPath)).toEqual(latest);
  });

  it('returns undefined when no line in the record parses as a snapshot', async () => {
    await appendSnapshot(recordPath, buildSnapshot({ onInvocation: 10 }));
    await writeFile(recordPath, 'not json at all\n', { flag: 'w' });

    expect(await readLatestSnapshot(recordPath)).toBeUndefined();
  });
});

// region | Helpers

/** Builds a snapshot whose on-invocation total distinguishes it from its neighbors in a record. */
function buildSnapshot(overrides: { onInvocation: number }): SizeSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    kind: 'snapshot',
    recordedAt: '2026-09-19T08:00:00.000Z',
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
