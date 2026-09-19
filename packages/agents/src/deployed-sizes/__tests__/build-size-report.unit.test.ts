import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DeployedPath, DeployedPathSet } from '../../commands/sync/collect-deployed-paths.ts';
import { buildSizeReport, GROWTH_CEILING_BYTES, type SizeReport } from '../build-size-report.ts';
import type { DeploymentMeasurement } from '../measure-deployment.ts';
import { SNAPSHOT_SCHEMA_VERSION } from '../schema.ts';
import type { DeployedFile, SizeAggregates, SizeSnapshot } from '../types.ts';

const REPO_ROOT = path.join('/', 'repo');
const IN_REPO_SOURCE = path.join(REPO_ROOT, 'packages', 'agents', 'content');
const VENDORED_SOURCE = path.join(REPO_ROOT, 'node_modules', 'acme-guidance', 'content');
const OUTSIDE_SOURCE = path.join('/', 'elsewhere', 'content');

/** A document at the ceiling, and one comfortably below it, so that a crossing is stated rather than computed. */
const AT_CEILING = GROWTH_CEILING_BYTES;
const BELOW_CEILING = GROWTH_CEILING_BYTES - 1;

describe(buildSizeReport, () => {
  it('reports a document that this deployment resized, with its size and its change', () => {
    const report = build({
      measured: { 'claude/skills/plan/SKILL.md': 2_048 },
      previous: { 'claude/skills/plan/SKILL.md': 1_024 },
    });

    expect(report.changes).toEqual([
      { kind: 'resized', key: 'claude/skills/plan/SKILL.md', bytes: 2_048, delta: 1_024 },
    ]);
  });

  it('reports a document that this deployment added', () => {
    const report = build({ measured: { 'claude/skills/new/SKILL.md': 512 }, previous: {} });

    expect(report.changes).toEqual([{ kind: 'added', key: 'claude/skills/new/SKILL.md', bytes: 512, delta: 512 }]);
  });

  it('reports a document that this deployment removed, as its previous bytes negated', () => {
    const report = build({ measured: {}, previous: { 'claude/skills/old/SKILL.md': 800 } });

    expect(report.changes).toEqual([{ kind: 'removed', key: 'claude/skills/old/SKILL.md', bytes: 0, delta: -800 }]);
  });

  it('reports no change for a document whose bytes are unchanged', () => {
    const report = build({ measured: { 'a.md': 1_024 }, previous: { 'a.md': 1_024 } });

    expect(report.changes).toEqual([]);
  });

  it('leaves assets out of the change list, which answers what a session loads', () => {
    const report = buildSizeReport({
      measured: measurement({ 'claude/skills/plan/run.mjs': { bytes: 900_000, kind: 'asset' } }),
      previous: snapshot({ 'claude/skills/plan/run.mjs': { bytes: 10, kind: 'asset' } }),
      set: { files: [], ambientHostPaths: [] },
      repoRoot: undefined,
    });

    expect(report.changes).toEqual([]);
    expect(report.documentCount).toBe(0);
  });

  it('orders changes by the size of the change, putting a large removal where a large addition would be', () => {
    const report = build({
      measured: { 'small-growth.md': 1_100, 'large-growth.md': 9_000 },
      previous: { 'small-growth.md': 1_000, 'large-removal.md': 5_000 },
    });

    expect(report.changes.map((change) => change.key)).toEqual([
      'large-growth.md',
      'large-removal.md',
      'small-growth.md',
    ]);
  });

  it('orders two changes of one size by key, so that the list is stable', () => {
    const report = build({ measured: { 'beta.md': 200, 'alpha.md': 200 }, previous: {} });

    expect(report.changes.map((change) => change.key)).toEqual(['alpha.md', 'beta.md']);
  });

  it('warns when a document recorded below the ceiling reaches it', () => {
    const report = build({ measured: { 'a.md': AT_CEILING }, previous: { 'a.md': BELOW_CEILING } });

    expect(report.warnings).toEqual([{ key: 'a.md', bytes: AT_CEILING, mayStreamline: false }]);
  });

  it('warns when a newly deployed document arrives at or above the ceiling', () => {
    const report = build({ measured: { 'a.md': AT_CEILING }, previous: {} });

    expect(report.warnings.map((warning) => warning.key)).toEqual(['a.md']);
  });

  it('raises no warning for a document that was already at or above the ceiling', () => {
    const report = build({ measured: { 'a.md': AT_CEILING * 3 }, previous: { 'a.md': AT_CEILING } });

    expect(report.warnings).toEqual([]);
  });

  it('raises no warning for a document that stays below the ceiling', () => {
    const report = build({ measured: { 'a.md': BELOW_CEILING }, previous: { 'a.md': 10 } });

    expect(report.warnings).toEqual([]);
  });

  it('raises no warning at all on a first recorded deployment, which has no crossing to observe', () => {
    const report = buildSizeReport({
      measured: measurement({ 'a.md': { bytes: AT_CEILING * 10, kind: 'document' } }),
      previous: undefined,
      set: { files: [collected('a.md', IN_REPO_SOURCE)], ambientHostPaths: [] },
      repoRoot: REPO_ROOT,
    });

    expect(report.isFirstRecorded).toBe(true);
    expect(report.warnings).toEqual([]);
  });

  it('names the deployment as first recorded only when the record held no previous snapshot', () => {
    expect(build({ measured: { 'a.md': 1 }, previous: {} }).isFirstRecorded).toBe(false);
  });

  it('may name the streamlining skill for a source inside the repository and outside node_modules', () => {
    const report = build({
      measured: { 'a.md': AT_CEILING },
      previous: { 'a.md': BELOW_CEILING },
      sourceRoot: IN_REPO_SOURCE,
      repoRoot: REPO_ROOT,
    });

    expect(report.warnings[0]?.mayStreamline).toBe(true);
  });

  it('withholds the streamlining skill for a source under node_modules, which the reader does not maintain', () => {
    const report = build({
      measured: { 'a.md': AT_CEILING },
      previous: { 'a.md': BELOW_CEILING },
      sourceRoot: VENDORED_SOURCE,
      repoRoot: REPO_ROOT,
    });

    expect(report.warnings[0]?.mayStreamline).toBe(false);
  });

  it('withholds the streamlining skill for a source outside the repository', () => {
    const report = build({
      measured: { 'a.md': AT_CEILING },
      previous: { 'a.md': BELOW_CEILING },
      sourceRoot: OUTSIDE_SOURCE,
      repoRoot: REPO_ROOT,
    });

    expect(report.warnings[0]?.mayStreamline).toBe(false);
  });

  it('withholds the streamlining skill for a file that no source backs', () => {
    const report = build({
      measured: { 'a.md': AT_CEILING },
      previous: { 'a.md': BELOW_CEILING },
      sourceRoot: undefined,
      repoRoot: REPO_ROOT,
    });

    expect(report.warnings[0]?.mayStreamline).toBe(false);
  });

  it('withholds the streamlining skill when the deployment ran outside any repository', () => {
    const report = build({
      measured: { 'a.md': AT_CEILING },
      previous: { 'a.md': BELOW_CEILING },
      sourceRoot: IN_REPO_SOURCE,
      repoRoot: undefined,
    });

    expect(report.warnings[0]?.mayStreamline).toBe(false);
  });

  it('orders warnings by descending size, then by key', () => {
    const report = build({
      measured: { 'beta.md': AT_CEILING, 'alpha.md': AT_CEILING, 'largest.md': AT_CEILING * 2 },
      previous: {},
    });

    expect(report.warnings.map((warning) => warning.key)).toEqual(['largest.md', 'alpha.md', 'beta.md']);
  });

  it('passes the measured aggregates and the document count through', () => {
    const report = buildSizeReport({
      measured: {
        files: { 'a.md': { bytes: 10, kind: 'document' }, 'b.mjs': { bytes: 20, kind: 'asset' } },
        expansions: {},
        documentExpansions: {},
        aggregates: aggregates({ onInvocation: 10, assets: 20 }),
      },
      previous: undefined,
      set: { files: [], ambientHostPaths: [] },
      repoRoot: undefined,
    });

    expect(report.aggregates).toEqual(aggregates({ onInvocation: 10, assets: 20 }));
    expect(report.documentCount).toBe(1);
  });
});

// region | Helpers

/** Aggregates stating zero throughout, overridden per assertion. */
function aggregates(overrides: Partial<SizeAggregates> = {}): SizeAggregates {
  return {
    alwaysLoaded: { total: 0, ambientRegions: 0, skillDescriptions: 0, subagentDescriptions: 0 },
    onInvocation: 0,
    assets: 0,
    ...overrides,
  };
}

/**
 * A report over documents alone, stated as bytes by key. `sourceRoot` attributes every measured document to one
 * source, which is all that the attribution assertions need.
 */
function build(input: {
  measured: Record<string, number>;
  previous: Record<string, number>;
  sourceRoot?: string | undefined;
  repoRoot?: string | undefined;
}): SizeReport {
  const asDocuments = (bytesByKey: Record<string, number>): Record<string, DeployedFile> =>
    Object.fromEntries(Object.entries(bytesByKey).map(([key, bytes]) => [key, { bytes, kind: 'document' as const }]));
  const set: DeployedPathSet = {
    files: Object.keys(input.measured).map((key) => collected(key, input.sourceRoot)),
    ambientHostPaths: [],
  };
  return buildSizeReport({
    measured: measurement(asDocuments(input.measured)),
    previous: snapshot(asDocuments(input.previous)),
    set,
    repoRoot: input.repoRoot,
  });
}

/** One collected path, carrying the source root that decides whether the reader may be pointed at it. */
function collected(key: string, sourceRoot: string | undefined): DeployedPath {
  return {
    key,
    absPath: path.join('/deployed', key),
    kind: 'document',
    role: 'other',
    harnessId: 'claude',
    sourceRoot,
    authored: undefined,
  };
}

/** A measurement stating `files` as its vector, with aggregates that no assertion here reads. */
function measurement(files: Record<string, DeployedFile>): DeploymentMeasurement {
  return { files, expansions: {}, documentExpansions: {}, aggregates: aggregates() };
}

/** A previous snapshot stating `files` as its vector. */
function snapshot(files: Record<string, DeployedFile>): SizeSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    kind: 'snapshot',
    recordedAt: '2026-09-19T08:00:00.000Z',
    version: '0.15.0',
    files,
    aggregates: aggregates(),
  };
}

// endregion | Helpers
