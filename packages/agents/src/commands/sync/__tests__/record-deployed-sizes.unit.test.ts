import { describe, expect, it } from 'vitest';

import { REVIEW_MARKER_SCHEMA_VERSION, SNAPSHOT_SCHEMA_VERSION } from '../../../deployed-sizes/schema.ts';
import type { ReviewMarker, SizeAggregates, SizeSnapshot } from '../../../deployed-sizes/types.ts';
import { resolveReviewBaselines } from '../record-deployed-sizes.ts';

const KEY = 'claude/skills/plan/SKILL.md';

describe(resolveReviewBaselines, () => {
  it('measures from the first snapshot recorded after the review, which states the streamlined size', () => {
    const lines = [
      snapshotLine('2026-09-01T00:00:00.000Z', 12_288),
      markerLine('2026-09-02T00:00:00.000Z'),
      snapshotLine('2026-09-03T00:00:00.000Z', 10_240),
      snapshotLine('2026-09-04T00:00:00.000Z', 11_000),
    ];

    expect(resolveReviewBaselines(lines)).toEqual([
      {
        recordedAt: '2026-09-02T00:00:00.000Z',
        reviewed: ['skills/plan/SKILL.md'],
        files: { [KEY]: { bytes: 10_240, kind: 'document' } },
      },
    ]);
  });

  it('falls back to the snapshot before the review until a later one is recorded', () => {
    const lines = [snapshotLine('2026-09-01T00:00:00.000Z', 12_288), markerLine('2026-09-02T00:00:00.000Z')];

    expect(resolveReviewBaselines(lines)).toEqual([
      {
        recordedAt: '2026-09-02T00:00:00.000Z',
        reviewed: ['skills/plan/SKILL.md'],
        files: { [KEY]: { bytes: 12_288, kind: 'document' } },
      },
    ]);
  });

  it('drops a marker that the record holds no snapshot for on either side', () => {
    expect(resolveReviewBaselines([markerLine('2026-09-02T00:00:00.000Z')])).toEqual([]);
  });

  it('returns no review for a record carrying no marker', () => {
    expect(resolveReviewBaselines([snapshotLine('2026-09-01T00:00:00.000Z', 12_288)])).toEqual([]);
  });
});

// region | Helpers

/** Aggregates stating zero throughout, which no assertion here reads. */
function buildAggregates(): SizeAggregates {
  return {
    alwaysLoaded: { total: 0, ambientRegions: 0, skillDescriptions: 0, subagentDescriptions: 0 },
    onInvocation: 0,
    assets: 0,
  };
}

/** One record line holding a review marker at the given instant. */
function markerLine(recordedAt: string): string {
  const marker: ReviewMarker = {
    schemaVersion: REVIEW_MARKER_SCHEMA_VERSION,
    kind: 'review',
    recordedAt,
    reviewed: ['skills/plan/SKILL.md'],
  };
  return JSON.stringify(marker);
}

/** One record line holding a snapshot that states the document at the given size. */
function snapshotLine(recordedAt: string, bytes: number): string {
  const snapshot: SizeSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    kind: 'snapshot',
    recordedAt,
    version: '0.15.0',
    files: { [KEY]: { bytes, kind: 'document' } },
    aggregates: buildAggregates(),
  };
  return JSON.stringify(snapshot);
}

// endregion | Helpers
