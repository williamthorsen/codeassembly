import { describe, expect, it } from 'vitest';

import { parseSnapshotLine, SNAPSHOT_SCHEMA_VERSION } from '../schema.ts';
import type { SizeSnapshot } from '../types.ts';

const SNAPSHOT: SizeSnapshot = {
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  kind: 'snapshot',
  recordedAt: '2026-09-19T08:00:00.000Z',
  version: '0.15.0',
  sourceCommit: '9b4f4b9a',
  files: { 'skills/plan/SKILL.md': { bytes: 1_200, kind: 'document' } },
  aggregates: {
    alwaysLoaded: { total: 300, ambientRegions: 100, skillDescriptions: 150, subagentDescriptions: 50 },
    onInvocation: 1_200,
    assets: 0,
  },
};

describe(parseSnapshotLine, () => {
  it('parses a whole snapshot line', () => {
    expect(parseSnapshotLine(JSON.stringify(SNAPSHOT))).toEqual(SNAPSHOT);
  });

  it('parses a snapshot recorded from a source tree with no commit', () => {
    const { sourceCommit, ...withoutCommit } = SNAPSHOT;

    expect(parseSnapshotLine(JSON.stringify(withoutCommit))).toEqual(withoutCommit);
  });

  it('rejects a truncated line', () => {
    expect(parseSnapshotLine(JSON.stringify(SNAPSHOT).slice(0, 40))).toBeUndefined();
  });

  it('rejects a line of another kind', () => {
    expect(
      parseSnapshotLine(JSON.stringify({ schemaVersion: 1, kind: 'review', reviewedAt: '2026-09-19' })),
    ).toBeUndefined();
  });

  it('rejects a line written by a later schema version', () => {
    expect(
      parseSnapshotLine(JSON.stringify({ ...SNAPSHOT, schemaVersion: SNAPSHOT_SCHEMA_VERSION + 1 })),
    ).toBeUndefined();
  });

  it('rejects a snapshot whose aggregates omit a component', () => {
    const missing = { ...SNAPSHOT, aggregates: { ...SNAPSHOT.aggregates, alwaysLoaded: { total: 300 } } };

    expect(parseSnapshotLine(JSON.stringify(missing))).toBeUndefined();
  });

  it('rejects a document whose size is not a whole count of bytes', () => {
    const fractional = { ...SNAPSHOT, files: { 'a.md': { bytes: 1.5, kind: 'document' } } };

    expect(parseSnapshotLine(JSON.stringify(fractional))).toBeUndefined();
  });
});
