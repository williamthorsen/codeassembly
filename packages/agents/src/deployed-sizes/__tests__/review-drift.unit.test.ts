import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DeployedPath } from '../../commands/sync/collect-deployed-paths.ts';
import { buildReviewDrift, DRIFT_ROW_CAP, type ReviewBaseline } from '../review-drift.ts';
import type { DeployedFile } from '../types.ts';

const CONTENT_ROOT = path.join('/', 'repo', 'packages', 'agents', 'content');

describe(buildReviewDrift, () => {
  it('reports a document that this deployment left unchanged and that has grown since its review', () => {
    const drift = buildReviewDrift({
      current: new Map([['claude/skills/plan/SKILL.md', 3_000]]),
      files: [deployed('claude/skills/plan/SKILL.md', 'skills/plan/SKILL.md')],
      reviews: [review('2026-09-01T00:00:00.000Z', ['skills/plan/SKILL.md'], { 'claude/skills/plan/SKILL.md': 2_000 })],
    });

    expect(drift).toEqual({
      rows: [
        {
          key: 'claude/skills/plan/SKILL.md',
          bytes: 3_000,
          growth: 1_000,
          reviewedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      omittedCount: 0,
    });
  });

  it('reports one row per harness for an authored body that deploys to two', () => {
    const drift = buildReviewDrift({
      current: new Map([
        ['claude/skills/plan/SKILL.md', 3_000],
        ['rovo/skills/plan/SKILL.md', 3_000],
      ]),
      files: [
        deployed('claude/skills/plan/SKILL.md', 'skills/plan/SKILL.md'),
        deployed('rovo/skills/plan/SKILL.md', 'skills/plan/SKILL.md'),
      ],
      reviews: [
        review('2026-09-01T00:00:00.000Z', ['skills/plan/SKILL.md'], {
          'claude/skills/plan/SKILL.md': 2_000,
          'rovo/skills/plan/SKILL.md': 2_500,
        }),
      ],
    });

    expect(drift.rows.map((row) => [row.key, row.growth])).toEqual([
      ['claude/skills/plan/SKILL.md', 1_000],
      ['rovo/skills/plan/SKILL.md', 500],
    ]);
  });

  it('reports no row for a document that no marker names', () => {
    const drift = buildReviewDrift({
      current: new Map([['claude/skills/other/SKILL.md', 3_000]]),
      files: [deployed('claude/skills/other/SKILL.md', 'skills/other/SKILL.md')],
      reviews: [review('2026-09-01T00:00:00.000Z', ['skills/plan/SKILL.md'], { 'claude/skills/other/SKILL.md': 10 })],
    });

    expect(drift.rows).toEqual([]);
  });

  it('reports no row for a document that has shrunk since its review', () => {
    const drift = buildReviewDrift({
      current: new Map([['claude/skills/plan/SKILL.md', 1_000]]),
      files: [deployed('claude/skills/plan/SKILL.md', 'skills/plan/SKILL.md')],
      reviews: [review('2026-09-01T00:00:00.000Z', ['skills/plan/SKILL.md'], { 'claude/skills/plan/SKILL.md': 2_000 })],
    });

    expect(drift.rows).toEqual([]);
  });

  it('reports no row for a document whose bytes have not moved since its review', () => {
    const drift = buildReviewDrift({
      current: new Map([['claude/skills/plan/SKILL.md', 2_000]]),
      files: [deployed('claude/skills/plan/SKILL.md', 'skills/plan/SKILL.md')],
      reviews: [review('2026-09-01T00:00:00.000Z', ['skills/plan/SKILL.md'], { 'claude/skills/plan/SKILL.md': 2_000 })],
    });

    expect(drift.rows).toEqual([]);
  });

  it('reports no row for a document that the baseline snapshot did not hold', () => {
    const drift = buildReviewDrift({
      current: new Map([['claude/skills/plan/SKILL.md', 2_000]]),
      files: [deployed('claude/skills/plan/SKILL.md', 'skills/plan/SKILL.md')],
      reviews: [review('2026-09-01T00:00:00.000Z', ['skills/plan/SKILL.md'], {})],
    });

    expect(drift.rows).toEqual([]);
  });

  it('reports no row for a deployed file that renders from no authored document', () => {
    const asset: DeployedPath = {
      ...deployed('claude/skills/plan/run.mjs', 'skills/plan/run.mjs'),
      authored: undefined,
    };
    const drift = buildReviewDrift({
      current: new Map([['claude/skills/plan/run.mjs', 3_000]]),
      files: [asset],
      reviews: [review('2026-09-01T00:00:00.000Z', ['skills/plan/run.mjs'], { 'claude/skills/plan/run.mjs': 10 })],
    });

    expect(drift.rows).toEqual([]);
  });

  it('counts the growth from the newest review naming the document', () => {
    const drift = buildReviewDrift({
      current: new Map([['claude/skills/plan/SKILL.md', 3_000]]),
      files: [deployed('claude/skills/plan/SKILL.md', 'skills/plan/SKILL.md')],
      reviews: [
        review('2026-09-01T00:00:00.000Z', ['skills/plan/SKILL.md'], { 'claude/skills/plan/SKILL.md': 1_000 }),
        review('2026-09-10T00:00:00.000Z', ['skills/plan/SKILL.md'], { 'claude/skills/plan/SKILL.md': 2_800 }),
      ],
    });

    expect(drift.rows).toEqual([
      { key: 'claude/skills/plan/SKILL.md', bytes: 3_000, growth: 200, reviewedAt: '2026-09-10T00:00:00.000Z' },
    ]);
  });

  it('ranks the rows by growth, largest first', () => {
    const drift = buildReviewDrift({
      current: new Map([
        ['claude/skills/a/SKILL.md', 1_100],
        ['claude/skills/b/SKILL.md', 3_000],
      ]),
      files: [
        deployed('claude/skills/a/SKILL.md', 'skills/a/SKILL.md'),
        deployed('claude/skills/b/SKILL.md', 'skills/b/SKILL.md'),
      ],
      reviews: [
        review('2026-09-01T00:00:00.000Z', ['skills/a/SKILL.md', 'skills/b/SKILL.md'], {
          'claude/skills/a/SKILL.md': 1_000,
          'claude/skills/b/SKILL.md': 1_000,
        }),
      ],
    });

    expect(drift.rows.map((row) => row.key)).toEqual(['claude/skills/b/SKILL.md', 'claude/skills/a/SKILL.md']);
  });

  it('counts the documents past the cap rather than dropping them', () => {
    const grown = DRIFT_ROW_CAP + 1;
    const keys = Array.from({ length: grown }, (_, index) => `claude/skills/s${index}/SKILL.md`);
    const authoredPaths = Array.from({ length: grown }, (_, index) => `skills/s${index}/SKILL.md`);
    const drift = buildReviewDrift({
      // The smallest growth belongs to the last key, which is the one that the cap leaves out.
      current: new Map(keys.map((key, index) => [key, 1_000 + (grown - index)])),
      files: keys.map((key, index) => deployed(key, authoredPaths[index] ?? '')),
      reviews: [review('2026-09-01T00:00:00.000Z', authoredPaths, Object.fromEntries(keys.map((key) => [key, 1_000])))],
    });

    expect(drift.rows.length).toBe(DRIFT_ROW_CAP);
    expect(drift.omittedCount).toBe(1);
    expect(drift.rows.map((row) => row.key)).not.toContain(keys.at(-1));
  });
});

// region | Helpers

/** One deployed document, carrying the authored provenance through which a marker's name joins to its key. */
function deployed(key: string, authoredRelPath: string): DeployedPath {
  return {
    key,
    absPath: path.join('/deployed', key),
    kind: 'document',
    role: 'other',
    harnessId: 'claude',
    sourceRoot: CONTENT_ROOT,
    authored: {
      file: path.join(CONTENT_ROOT, ...authoredRelPath.split('/')),
      contentRoot: CONTENT_ROOT,
      sourceName: undefined,
    },
  };
}

/** One review, with the deployed-byte vector that stood when it ran. */
function review(
  recordedAt: string,
  reviewed: ReadonlyArray<string>,
  bytesByKey: Record<string, number>,
): ReviewBaseline {
  const files: Record<string, DeployedFile> = Object.fromEntries(
    Object.entries(bytesByKey).map(([key, bytes]) => [key, { bytes, kind: 'document' as const }]),
  );
  return { recordedAt, reviewed, files };
}

// endregion | Helpers
