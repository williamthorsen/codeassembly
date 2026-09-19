import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DeploymentMeasurement } from '../measure-deployment.ts';
import { parseSnapshotLine, SNAPSHOT_SCHEMA_VERSION } from '../schema.ts';
import { shouldAppend } from '../should-append.ts';
import type { DeployedFile, SizeAggregates, SizeSnapshot } from '../types.ts';

const execFileAsync = promisify(execFile);

const VECTOR: Record<string, DeployedFile> = {
  'claude/skills/plan/SKILL.md': { bytes: 1_200, kind: 'document' },
  'claude/skills/plan/run.mjs': { bytes: 400, kind: 'asset' },
};

describe(shouldAppend, () => {
  let scratch: string;
  let sourceRoot: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'should-append-'));
    sourceRoot = await initRepoOnDefaultBranch(scratch);
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('appends the first vector, which no previous snapshot can equal', async () => {
    expect(await shouldAppend({ measured: measure(VECTOR), previous: undefined, sourceRoot })).toBe(true);
  });

  it('does not append a measurement equal to the previous snapshot', async () => {
    const previous = snapshotOf(measure(VECTOR));

    expect(await shouldAppend({ measured: measure(VECTOR), previous, sourceRoot })).toBe(false);
  });

  it('appends a vector whose keys match but whose bytes differ', async () => {
    const grown = { ...VECTOR, 'claude/skills/plan/SKILL.md': { bytes: 1_300, kind: 'document' as const } };

    expect(await shouldAppend({ measured: measure(grown), previous: snapshotOf(measure(VECTOR)), sourceRoot })).toBe(
      true,
    );
  });

  it('appends a vector that gained a file', async () => {
    const gained = { ...VECTOR, 'claude/skills/review/SKILL.md': { bytes: 900, kind: 'document' as const } };

    expect(await shouldAppend({ measured: measure(gained), previous: snapshotOf(measure(VECTOR)), sourceRoot })).toBe(
      true,
    );
  });

  it('appends a vector that lost a file', async () => {
    const { 'claude/skills/plan/run.mjs': _dropped, ...lost } = VECTOR;

    expect(await shouldAppend({ measured: measure(lost), previous: snapshotOf(measure(VECTOR)), sourceRoot })).toBe(
      true,
    );
  });

  it('appends an ambient-region edit, which changes an aggregate and no file', async () => {
    const previous = snapshotOf(measure(VECTOR, { ambientRegions: 2_000 }));
    const edited = measure(VECTOR, { ambientRegions: 2_400 });

    expect(await shouldAppend({ measured: edited, previous, sourceRoot })).toBe(true);
  });

  it('appends a description edit that leaves its file the same size', async () => {
    const previous = snapshotOf(measure(VECTOR, { skillDescriptions: 40 }));
    const reworded = measure(VECTOR, { skillDescriptions: 52 });

    expect(await shouldAppend({ measured: reworded, previous, sourceRoot })).toBe(true);
  });

  it('does not append when the files and every aggregate are unchanged', async () => {
    const measured = measure(VECTOR, { ambientRegions: 2_000, skillDescriptions: 40, subagentDescriptions: 12 });

    expect(await shouldAppend({ measured, previous: snapshotOf(measured), sourceRoot })).toBe(false);
  });

  it('reads an unchanged previous snapshot back out of a record line as unchanged', async () => {
    const measured = measure(VECTOR, { ambientRegions: 2_000, skillDescriptions: 40, subagentDescriptions: 12 });
    const previous = parseSnapshotLine(JSON.stringify(snapshotOf(measured)));

    expect(await shouldAppend({ measured, previous, sourceRoot })).toBe(false);
  });

  it('does not append from a commit that the default branch does not contain', async () => {
    await git(sourceRoot, ['checkout', '--quiet', '-b', 'feature']);
    await writeFile(path.join(sourceRoot, 'feature.txt'), 'unmerged\n', 'utf8');
    await git(sourceRoot, ['add', '.']);
    await commit(sourceRoot, 'unmerged work');

    expect(await shouldAppend({ measured: measure(VECTOR), previous: undefined, sourceRoot })).toBe(false);
  });

  it('appends from a source tree that is not a git tree', async () => {
    expect(await shouldAppend({ measured: measure(VECTOR), previous: undefined, sourceRoot: scratch })).toBe(true);
  });

  it('appends from a clone whose remote names no default branch', async () => {
    const bare = path.join(scratch, 'no-remote');
    await git(scratch, ['init', '--quiet', '--initial-branch', 'trunk', 'no-remote']);
    await writeFile(path.join(bare, 'file.txt'), 'content\n', 'utf8');
    await git(bare, ['add', '.']);
    await commit(bare, 'initial');

    expect(await shouldAppend({ measured: measure(VECTOR), previous: undefined, sourceRoot: bare })).toBe(true);
  });

  it('reads origin/main when the remote records no origin/HEAD', async () => {
    await git(sourceRoot, ['symbolic-ref', '--delete', 'refs/remotes/origin/HEAD']);
    await git(sourceRoot, ['checkout', '--quiet', '-b', 'feature']);
    await writeFile(path.join(sourceRoot, 'feature.txt'), 'unmerged\n', 'utf8');
    await git(sourceRoot, ['add', '.']);
    await commit(sourceRoot, 'unmerged work');

    expect(await shouldAppend({ measured: measure(VECTOR), previous: undefined, sourceRoot })).toBe(false);
  });
});

// region | Helpers

/** Records a commit, supplying the identity and signing settings that the machine's own git config may withhold. */
async function commit(cwd: string, message: string): Promise<void> {
  await git(cwd, [
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--quiet',
    '--message',
    message,
  ]);
}

/** Runs one git command in a scratch tree, never against the working repository. */
async function git(cwd: string, args: ReadonlyArray<string>): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args]);
  return stdout;
}

/**
 * Builds a disposable repository whose `HEAD` sits on the default branch: one commit on `main`, an `origin` remote
 * pointing at itself, and the remote-tracking refs that the gate reads.
 */
async function initRepoOnDefaultBranch(scratch: string): Promise<string> {
  const sourceRoot = path.join(scratch, 'source');
  await git(scratch, ['init', '--quiet', '--initial-branch', 'main', 'source']);
  await writeFile(path.join(sourceRoot, 'file.txt'), 'content\n', 'utf8');
  await git(sourceRoot, ['add', '.']);
  await commit(sourceRoot, 'initial');
  await git(sourceRoot, ['remote', 'add', 'origin', sourceRoot]);
  await git(sourceRoot, ['fetch', '--quiet', 'origin']);
  await git(sourceRoot, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);
  return sourceRoot;
}

/** A measurement stating `files` and whichever always-loaded components the case varies. */
function measure(
  files: Record<string, DeployedFile>,
  alwaysLoaded: Partial<Omit<SizeAggregates['alwaysLoaded'], 'total'>> = {},
): DeploymentMeasurement {
  const components = { ambientRegions: 0, skillDescriptions: 0, subagentDescriptions: 0, ...alwaysLoaded };
  const total = components.ambientRegions + components.skillDescriptions + components.subagentDescriptions;
  return {
    files,
    expansions: {},
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
    aggregates: measured.aggregates,
  };
}

// endregion | Helpers
