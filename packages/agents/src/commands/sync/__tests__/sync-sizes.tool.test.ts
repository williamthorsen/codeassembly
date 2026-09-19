import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readLatestSnapshot } from '../../../deployed-sizes/read-record.ts';
import { resolveRecordPath } from '../../../deployed-sizes/resolve-record-path.ts';
import { resolveHarnessPaths } from '../../../lib/harness.ts';
import type { InstallOptions } from '../../../lib/types.ts';
import type { DeployedPathSources } from '../collect-deployed-paths.ts';
import { recordDeployedSizes } from '../record-deployed-sizes.ts';
import { syncCommand } from '../sync.ts';
import type { SyncDomain } from '../sync-domain.ts';

const execFileAsync = promisify(execFile);

describe(recordDeployedSizes, () => {
  let scratch: string;
  let homeDir: string;
  let projectRoot: string;
  let packageRoot: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'sync-sizes-'));
    homeDir = path.join(scratch, 'home');
    projectRoot = path.join(scratch, 'project');
    await mkdir(homeDir, { recursive: true });
    await mkdir(projectRoot, { recursive: true });
    packageRoot = await initRepoOnDefaultBranch(scratch);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(scratch, { recursive: true, force: true });
  });

  it('appends a snapshot of the home domain to the home record', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', homeDir);
    const body = '---\nname: plan\n---\n\n# Plan\n';
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), body);

    await recordDeployedSizes(planWithSkill('plan', skillsDir), homeDomain(homeDir), homeDir, packageRoot);

    const snapshot = await readLatestSnapshot(resolveRecordPath({ home: homeDir, domain: 'home' }));
    expect(snapshot?.documents).toEqual({
      'claude/skills/plan/SKILL.md': { bytes: Buffer.byteLength(body, 'utf8'), kind: 'document' },
    });
  });

  it('appends a repo domain snapshot to its own record rather than to the home record', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', projectRoot);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), '---\nname: plan\n---\n\n# Plan\n');

    await recordDeployedSizes(planWithSkill('plan', skillsDir), repoDomain(projectRoot), homeDir, packageRoot);

    const homeRecord = resolveRecordPath({ home: homeDir, domain: 'home' });
    const repoRecord = resolveRecordPath({ home: homeDir, domain: 'repo', repo: undefined });
    expect(existsSync(homeRecord)).toBe(false);
    expect((await readLatestSnapshot(repoRecord))?.documents).not.toEqual({});
  });

  it('stamps each snapshot with the deploying build and the commit that its source sat on', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', homeDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');

    await recordDeployedSizes(planWithSkill('plan', skillsDir), homeDomain(homeDir), homeDir, packageRoot);

    const snapshot = await readLatestSnapshot(resolveRecordPath({ home: homeDir, domain: 'home' }));
    expect(snapshot?.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(snapshot?.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('appends no second line when a later run measures the same vector', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', homeDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');
    const plan = planWithSkill('plan', skillsDir);

    await recordDeployedSizes(plan, homeDomain(homeDir), homeDir, packageRoot);
    await recordDeployedSizes(plan, homeDomain(homeDir), homeDir, packageRoot);

    expect(await countLines(resolveRecordPath({ home: homeDir, domain: 'home' }))).toBe(1);
  });

  it('appends a second line once the deployment has grown', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', homeDir);
    const body = path.join(skillsDir, 'plan', 'SKILL.md');
    await writeDeployedFile(body, 'body');
    const plan = planWithSkill('plan', skillsDir);
    await recordDeployedSizes(plan, homeDomain(homeDir), homeDir, packageRoot);

    await writeDeployedFile(body, 'a much longer body than before');
    await recordDeployedSizes(plan, homeDomain(homeDir), homeDir, packageRoot);

    expect(await countLines(resolveRecordPath({ home: homeDir, domain: 'home' }))).toBe(2);
  });

  it('prints one warning and throws nothing when the pass fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { skillsDir } = resolveHarnessPaths('claude', homeDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');
    // A file where the record's directory belongs, so that the append cannot create it.
    await writeDeployedFile(path.join(homeDir, '.codeassembly', 'deployed-sizes'), 'not a directory');

    await expect(
      recordDeployedSizes(planWithSkill('plan', skillsDir), homeDomain(homeDir), homeDir, packageRoot),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("The deployment's sizes were not recorded");
  });
});

describe('sync --dry-run', () => {
  let scratch: string;
  let homeDir: string;
  let projectRoot: string;
  let contentDir: string;

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'sync-sizes-dry-'));
    homeDir = path.join(scratch, 'home');
    projectRoot = path.join(scratch, 'project');
    contentDir = path.join(scratch, 'content');
    await mkdir(path.join(homeDir, '.claude'), { recursive: true });
    await mkdir(path.join(contentDir, 'guidance', 'rulebooks'), { recursive: true });
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await writeFile(
      path.join(contentDir, 'guidance', 'rulebooks', 'style.md'),
      '---\nslug: style\ndelivery: ambient\n---\n\n# Style\n',
      'utf8',
    );
    await writeFile(
      path.join(projectRoot, '.agents', 'codeassembly.yaml'),
      'rulebooks:\n  use:\n    - style\n',
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('measures nothing and appends nothing', async () => {
    await syncCommand(options({ dryRun: true }), projectRoot, contentDir, homeDir);

    expect(existsSync(recordRoot(homeDir))).toBe(false);
  });

  it('leaves the report and the exit path of a live sync unchanged', async () => {
    const outcome = await syncCommand(options(), projectRoot, contentDir, homeDir);

    expect(outcome.kind).toBe('reconciled');
    expect(existsSync(path.join(projectRoot, 'CLAUDE.local.md'))).toBe(true);
  });
});

// region | Helpers

/** The directory under which every record is written, whose absence means that nothing was appended. */
function recordRoot(home: string): string {
  return path.join(home, '.codeassembly', 'deployed-sizes');
}

/** Counts the lines that a record holds, which is how many snapshots the gate let through. */
async function countLines(recordPath: string): Promise<number> {
  const raw = await readFile(recordPath, 'utf8');
  return raw.split('\n').filter((line) => line.trim() !== '').length;
}

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
async function git(cwd: string, args: ReadonlyArray<string>): Promise<void> {
  await execFileAsync('git', ['-C', cwd, ...args]);
}

/** The home domain, whose base is the home directory. */
function homeDomain(home: string): SyncDomain {
  return { baseDir: home, ambient: 'harness-home', anchorBase: '~' };
}

/**
 * Builds a disposable source tree whose `HEAD` sits on the default branch, which is what the append gate requires.
 * Never the working repository.
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

/** Sync options for a live run, overridden per test. */
function options(overrides: Partial<InstallOptions> = {}): InstallOptions {
  return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
}

/** Plan sources naming one declared skill deployed into `skillsDir`. */
function planWithSkill(slug: string, skillsDir: string): DeployedPathSources {
  return {
    ambientHosts: [],
    harnessSkillTargets: [{ harnessId: 'claude', skillsDir }],
    harnessSubagentTargets: [],
    resolved: [],
    resolvedSkills: [{ slug, srcDir: '', contentRoot: '', source: undefined }],
    resolvedSubagents: [],
    sourceSupportPlans: [],
    targets: { harnessIds: ['claude'] },
  };
}

/** The repo domain, rooted at a project directory. */
function repoDomain(projectRoot: string): SyncDomain {
  return { baseDir: projectRoot, ambient: 'project-local', anchorBase: projectRoot };
}

/** Writes one deployed file, creating its enclosing directories. */
async function writeDeployedFile(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

// endregion | Helpers
