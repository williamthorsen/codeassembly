import { describe, expect, it, vi } from 'vitest';

import type { AgentsGit } from '../../lib/git.ts';
import { makeFakeGit } from '../../lib/test-utils/make-fake-git.ts';
import type { DeploymentMeasurement } from '../measure-deployment.ts';
import { parseSnapshotLine, SNAPSHOT_SCHEMA_VERSION } from '../schema.ts';
import { shouldAppend } from '../should-append.ts';
import type { DeployedFile, ExpansionUnit, SizeAggregates, SizeSnapshot } from '../types.ts';

/** One expansion key, whose bytes and reach the attribution cases vary. */
const SHARED = 'partial:codeassembly/_partials/shared.md';

const VECTOR: Record<string, DeployedFile> = {
  'claude/skills/plan/SKILL.md': { bytes: 1_200, kind: 'document' },
  'claude/skills/plan/run.mjs': { bytes: 400, kind: 'asset' },
};

/** A source tree whose `HEAD` is on the default branch, which `origin/HEAD` names. */
const ON_DEFAULT_BRANCH = makeFakeGit({ ancestor: true, originHead: 'origin/main' });

describe(shouldAppend, () => {
  const sourceRoot = '/source';
  const git = ON_DEFAULT_BRANCH;

  it('appends the first vector, which does not have a previous snapshot to equal', async () => {
    expect(await shouldAppend({ measured: measure(VECTOR), previous: undefined, sourceRoot, git })).toBe(true);
  });

  it('does not append a measurement equal to the previous snapshot', async () => {
    const previous = snapshotOf(measure(VECTOR));

    expect(await shouldAppend({ measured: measure(VECTOR), previous, sourceRoot, git })).toBe(false);
  });

  it('appends a vector whose keys match but whose bytes differ', async () => {
    const grown = { ...VECTOR, 'claude/skills/plan/SKILL.md': { bytes: 1_300, kind: 'document' as const } };

    expect(
      await shouldAppend({ measured: measure(grown), previous: snapshotOf(measure(VECTOR)), sourceRoot, git }),
    ).toBe(true);
  });

  it('appends a vector that gained a file', async () => {
    const gained = { ...VECTOR, 'claude/skills/review/SKILL.md': { bytes: 900, kind: 'document' as const } };

    expect(
      await shouldAppend({ measured: measure(gained), previous: snapshotOf(measure(VECTOR)), sourceRoot, git }),
    ).toBe(true);
  });

  it('appends a vector that lost a file', async () => {
    const { 'claude/skills/plan/run.mjs': _dropped, ...lost } = VECTOR;

    expect(
      await shouldAppend({ measured: measure(lost), previous: snapshotOf(measure(VECTOR)), sourceRoot, git }),
    ).toBe(true);
  });

  it('appends an ambient-region edit, which changes an aggregate but does not change any file', async () => {
    const previous = snapshotOf(measure(VECTOR, { ambientRegions: 2_000 }));
    const edited = measure(VECTOR, { ambientRegions: 2_400 });

    expect(await shouldAppend({ measured: edited, previous, sourceRoot, git })).toBe(true);
  });

  it('appends a description edit that leaves its file the same size', async () => {
    const previous = snapshotOf(measure(VECTOR, { skillDescriptions: 40 }));
    const reworded = measure(VECTOR, { skillDescriptions: 52 });

    expect(await shouldAppend({ measured: reworded, previous, sourceRoot, git })).toBe(true);
  });

  it('does not append when the files and every aggregate are unchanged', async () => {
    const measured = measure(VECTOR, { ambientRegions: 2_000, skillDescriptions: 40, subagentDescriptions: 12 });

    expect(await shouldAppend({ measured, previous: snapshotOf(measured), sourceRoot, git })).toBe(false);
  });

  it('reads an unchanged previous snapshot back out of a record line as unchanged', async () => {
    const measured = measure(VECTOR, { ambientRegions: 2_000, skillDescriptions: 40, subagentDescriptions: 12 });
    const previous = parseSnapshotLine(JSON.stringify(snapshotOf(measured)));

    expect(await shouldAppend({ measured, previous, sourceRoot, git })).toBe(false);
  });

  it('appends a rewiring that changes a reach without changing any bytes', async () => {
    const previous = snapshotOf(measure(VECTOR, {}, { [SHARED]: { bytes: 300, reach: 4 } }));
    const rewired = measure(VECTOR, {}, { [SHARED]: { bytes: 300, reach: 5 } });

    expect(await shouldAppend({ measured: rewired, previous, sourceRoot, git })).toBe(true);
  });

  it('appends a measurement whose expansions the previous snapshot does not state', async () => {
    const { expansions, ...withoutExpansions } = snapshotOf(measure(VECTOR));

    expect(await shouldAppend({ measured: measure(VECTOR), previous: withoutExpansions, sourceRoot, git })).toBe(true);
  });

  it('does not append when the files, the expansions, and every aggregate are unchanged', async () => {
    const measured = measure(VECTOR, { ambientRegions: 2_000 }, { [SHARED]: { bytes: 300, reach: 4 } });

    expect(await shouldAppend({ measured, previous: snapshotOf(measured), sourceRoot, git })).toBe(false);
  });

  it('does not append from a commit that the default branch does not contain', async () => {
    const onFeature = makeFakeGit({ ancestor: false, originHead: 'origin/main' });

    expect(await shouldAppend({ measured: measure(VECTOR), previous: undefined, sourceRoot, git: onFeature })).toBe(
      false,
    );
  });

  it('judges ancestry against the branch that origin/HEAD names', async () => {
    const isAncestor = vi.fn<AgentsGit['isAncestor']>().mockResolvedValue(true);
    const trunk = { ...makeFakeGit({ originHead: 'origin/trunk' }), isAncestor };

    await shouldAppend({ measured: measure(VECTOR), previous: undefined, sourceRoot, git: trunk });

    expect(isAncestor).toHaveBeenCalledWith(sourceRoot, 'HEAD', 'origin/trunk');
  });

  it('appends from a source tree that is not a git tree', async () => {
    expect(await shouldAppend({ measured: measure(VECTOR), previous: undefined, sourceRoot, git: makeFakeGit() })).toBe(
      true,
    );
  });

  it('appends from a clone whose remote does not name a default branch', async () => {
    const noDefault = makeFakeGit({ ancestor: false, verifiedRefs: ['HEAD'] });

    expect(await shouldAppend({ measured: measure(VECTOR), previous: undefined, sourceRoot, git: noDefault })).toBe(
      true,
    );
  });

  it('reads origin/main when the remote does not record an origin/HEAD', async () => {
    const isAncestor = vi.fn<AgentsGit['isAncestor']>().mockResolvedValue(false);
    const fallback = { ...makeFakeGit({ verifiedRefs: ['origin/main'] }), isAncestor };

    expect(await shouldAppend({ measured: measure(VECTOR), previous: undefined, sourceRoot, git: fallback })).toBe(
      false,
    );
    expect(isAncestor).toHaveBeenCalledWith(sourceRoot, 'HEAD', 'origin/main');
  });
});

// region | Helpers

/** A measurement stating `files` and whichever always-loaded components the case varies. */
function measure(
  files: Record<string, DeployedFile>,
  alwaysLoaded: Partial<Omit<SizeAggregates['alwaysLoaded'], 'total'>> = {},
  expansions: Record<string, ExpansionUnit> = {},
): DeploymentMeasurement {
  const components = { ambientRegions: 0, skillDescriptions: 0, subagentDescriptions: 0, ...alwaysLoaded };
  const total = components.ambientRegions + components.skillDescriptions + components.subagentDescriptions;
  return {
    files,
    expansions,
    documentExpansions: {},
    aggregates: {
      alwaysLoaded: { total, ...components },
      onInvocation: Object.values(files).reduce((sum, file) => sum + (file.kind === 'document' ? file.bytes : 0), 0),
      assets: Object.values(files).reduce((sum, file) => sum + (file.kind === 'asset' ? file.bytes : 0), 0),
    },
  };
}

/** A previous snapshot stating what `measured` measured. */
function snapshotOf(measured: DeploymentMeasurement): SizeSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    kind: 'snapshot',
    recordedAt: '2026-09-19T08:00:00.000Z',
    version: '0.15.0',
    files: measured.files,
    expansions: measured.expansions,
    aggregates: measured.aggregates,
  };
}

// endregion | Helpers
