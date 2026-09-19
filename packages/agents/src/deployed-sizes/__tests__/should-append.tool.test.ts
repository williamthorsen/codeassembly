import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SNAPSHOT_SCHEMA_VERSION } from '../schema.ts';
import { shouldAppend } from '../should-append.ts';
import type { DeployedDocument, SizeSnapshot } from '../types.ts';

const execFileAsync = promisify(execFile);

const VECTOR: Record<string, DeployedDocument> = {
  'claude/skills/plan/SKILL.md': { bytes: 1_200, kind: 'document' },
  'claude/skills/plan/run.mjs': { bytes: 400, kind: 'asset' },
};

describe(shouldAppend, () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'should-append-'));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('appends the first vector, which no previous snapshot can equal', async () => {
    const packageRoot = await initRepoOnDefaultBranch(scratch);

    expect(await shouldAppend({ documents: VECTOR, previous: undefined, packageRoot })).toBe(true);
  });

  it('does not append a vector equal to the previous snapshot', async () => {
    const packageRoot = await initRepoOnDefaultBranch(scratch);

    expect(await shouldAppend({ documents: VECTOR, previous: snapshotOf(VECTOR), packageRoot })).toBe(false);
  });

  it('appends a vector whose keys match but whose bytes differ', async () => {
    const packageRoot = await initRepoOnDefaultBranch(scratch);
    const grown = { ...VECTOR, 'claude/skills/plan/SKILL.md': { bytes: 1_300, kind: 'document' as const } };

    expect(await shouldAppend({ documents: grown, previous: snapshotOf(VECTOR), packageRoot })).toBe(true);
  });

  it('appends a vector that gained a file', async () => {
    const packageRoot = await initRepoOnDefaultBranch(scratch);
    const gained = { ...VECTOR, 'claude/skills/review/SKILL.md': { bytes: 900, kind: 'document' as const } };

    expect(await shouldAppend({ documents: gained, previous: snapshotOf(VECTOR), packageRoot })).toBe(true);
  });

  it('appends a vector that lost a file', async () => {
    const packageRoot = await initRepoOnDefaultBranch(scratch);
    const { 'claude/skills/plan/run.mjs': _dropped, ...lost } = VECTOR;

    expect(await shouldAppend({ documents: lost, previous: snapshotOf(VECTOR), packageRoot })).toBe(true);
  });

  it('does not append from a commit that the default branch does not contain', async () => {
    const packageRoot = await initRepoOnDefaultBranch(scratch);
    await git(packageRoot, ['checkout', '--quiet', '-b', 'feature']);
    await writeFile(path.join(packageRoot, 'feature.txt'), 'unmerged\n', 'utf8');
    await git(packageRoot, ['add', '.']);
    await commit(packageRoot, 'unmerged work');

    expect(await shouldAppend({ documents: VECTOR, previous: undefined, packageRoot })).toBe(false);
  });

  it('appends from a source tree that is not a git tree', async () => {
    expect(await shouldAppend({ documents: VECTOR, previous: undefined, packageRoot: scratch })).toBe(true);
  });

  it('appends from a clone whose remote names no default branch', async () => {
    const packageRoot = path.join(scratch, 'no-remote');
    await git(scratch, ['init', '--quiet', '--initial-branch', 'trunk', 'no-remote']);
    await writeFile(path.join(packageRoot, 'file.txt'), 'content\n', 'utf8');
    await git(packageRoot, ['add', '.']);
    await commit(packageRoot, 'initial');

    expect(await shouldAppend({ documents: VECTOR, previous: undefined, packageRoot })).toBe(true);
  });

  it('reads origin/main when the remote records no origin/HEAD', async () => {
    const packageRoot = await initRepoOnDefaultBranch(scratch);
    await git(packageRoot, ['symbolic-ref', '--delete', 'refs/remotes/origin/HEAD']);
    await git(packageRoot, ['checkout', '--quiet', '-b', 'feature']);
    await writeFile(path.join(packageRoot, 'feature.txt'), 'unmerged\n', 'utf8');
    await git(packageRoot, ['add', '.']);
    await commit(packageRoot, 'unmerged work');

    expect(await shouldAppend({ documents: VECTOR, previous: undefined, packageRoot })).toBe(false);
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
  const packageRoot = path.join(scratch, 'source');
  await git(scratch, ['init', '--quiet', '--initial-branch', 'main', 'source']);
  await writeFile(path.join(packageRoot, 'file.txt'), 'content\n', 'utf8');
  await git(packageRoot, ['add', '.']);
  await commit(packageRoot, 'initial');
  await git(packageRoot, ['remote', 'add', 'origin', packageRoot]);
  await git(packageRoot, ['fetch', '--quiet', 'origin']);
  await git(packageRoot, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);
  return packageRoot;
}

/** A previous snapshot stating `documents` as its size vector. */
function snapshotOf(documents: Record<string, DeployedDocument>): SizeSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    kind: 'snapshot',
    recordedAt: '2026-09-19T08:00:00.000Z',
    version: '0.15.0',
    documents,
    aggregates: {
      alwaysLoaded: { total: 0, ambientRegions: 0, skillDescriptions: 0, subagentDescriptions: 0 },
      onInvocation: 0,
      assets: 0,
    },
  };
}

// endregion | Helpers
