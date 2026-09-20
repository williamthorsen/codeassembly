import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readRecordLines, selectLatestSnapshot } from '../../../deployed-sizes/read-record.ts';
import { resolveRecordPath } from '../../../deployed-sizes/resolve-record-path.ts';
import { resolveHarnessPaths } from '../../../lib/harness.ts';
import type { InstallOptions } from '../../../lib/types.ts';
import type { DeployedPathSources, ResolveSourceRoot } from '../collect-deployed-paths.ts';
import { recordDeployedSizes } from '../record-deployed-sizes.ts';
import { syncCommand } from '../sync.ts';
import type { SyncDomain } from '../sync-domain.ts';
import { renderReportText } from '../test-utils/render-report-text.ts';

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

    await recordDeployedSizes({
      plan: planWithSkill('plan', skillsDir),
      domain: homeDomain(homeDir),
      homeDir,
      packageRoot,
      resolveSourceRoot,
    });

    const snapshot = selectLatestSnapshot(await readRecordLines(resolveRecordPath({ home: homeDir, domain: 'home' })));
    expect(snapshot?.files).toEqual({
      'claude/skills/plan/SKILL.md': { bytes: Buffer.byteLength(body, 'utf8'), kind: 'document' },
    });
  });

  it("carries the deployed documents' partials in the snapshot that it appends", async () => {
    const { skillsDir } = resolveHarnessPaths('claude', homeDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');
    const contentRoot = path.join(scratch, 'content');
    const partial = 'Shared.\n';
    await writeDeployedFile(path.join(contentRoot, '_partials', 'shared.md'), partial);
    await writeDeployedFile(
      path.join(contentRoot, 'skills', 'plan', 'SKILL.md'),
      'Plan.\n\n<!-- include: ../../_partials/shared.md / -->\n',
    );

    await recordDeployedSizes({
      plan: {
        ...planWithSkill('plan', skillsDir),
        resolvedSkills: [
          { slug: 'plan', srcDir: path.join(contentRoot, 'skills', 'plan'), contentRoot, source: undefined },
        ],
      },
      domain: homeDomain(homeDir),
      homeDir,
      packageRoot,
      resolveSourceRoot,
    });

    const snapshot = selectLatestSnapshot(await readRecordLines(resolveRecordPath({ home: homeDir, domain: 'home' })));
    expect(snapshot?.expansions).toEqual({
      'partial:library/_partials/shared.md': { bytes: Buffer.byteLength(partial, 'utf8'), reach: 1 },
    });
  });

  it('appends a repo domain snapshot to its own record rather than to the home record', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', projectRoot);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), '---\nname: plan\n---\n\n# Plan\n');

    await recordDeployedSizes({
      plan: planWithSkill('plan', skillsDir),
      domain: repoDomain(projectRoot),
      homeDir,
      packageRoot,
      resolveSourceRoot,
    });

    const homeRecord = resolveRecordPath({ home: homeDir, domain: 'home' });
    const repoRecord = resolveRecordPath({ home: homeDir, domain: 'repo', repo: undefined });
    expect(existsSync(homeRecord)).toBe(false);
    expect(selectLatestSnapshot(await readRecordLines(repoRecord))?.files).not.toEqual({});
  });

  it('stamps each snapshot with the deploying build and the commit that its source sat on', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', homeDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');

    await recordDeployedSizes({
      plan: planWithSkill('plan', skillsDir),
      domain: homeDomain(homeDir),
      homeDir,
      packageRoot,
      resolveSourceRoot,
    });

    const snapshot = selectLatestSnapshot(await readRecordLines(resolveRecordPath({ home: homeDir, domain: 'home' })));
    expect(snapshot?.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(snapshot?.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('appends no second line when a later run measures the same vector', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', homeDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');
    const plan = planWithSkill('plan', skillsDir);

    await recordDeployedSizes({ plan, domain: homeDomain(homeDir), homeDir, packageRoot, resolveSourceRoot });
    await recordDeployedSizes({ plan, domain: homeDomain(homeDir), homeDir, packageRoot, resolveSourceRoot });

    expect(await countLines(resolveRecordPath({ home: homeDir, domain: 'home' }))).toBe(1);
  });

  it('appends a second line once the deployment has grown', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', homeDir);
    const body = path.join(skillsDir, 'plan', 'SKILL.md');
    await writeDeployedFile(body, 'body');
    const plan = planWithSkill('plan', skillsDir);
    await recordDeployedSizes({ plan, domain: homeDomain(homeDir), homeDir, packageRoot, resolveSourceRoot });

    await writeDeployedFile(body, 'a much longer body than before');
    await recordDeployedSizes({ plan, domain: homeDomain(homeDir), homeDir, packageRoot, resolveSourceRoot });

    expect(await countLines(resolveRecordPath({ home: homeDir, domain: 'home' }))).toBe(2);
  });

  it('judges a repo domain by its own tree, not by the tree the binary ran from', async () => {
    const consumerRoot = await initRepoOnFeatureBranch(scratch);
    const { skillsDir } = resolveHarnessPaths('claude', consumerRoot);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');

    await recordDeployedSizes({
      plan: planWithSkill('plan', skillsDir),
      domain: repoDomain(consumerRoot),
      homeDir,
      packageRoot,
      resolveSourceRoot,
    });

    expect(existsSync(recordRoot(homeDir))).toBe(false);
  });

  it('judges the home domain by the tree the binary ran from', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', homeDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');

    await recordDeployedSizes({
      plan: planWithSkill('plan', skillsDir),
      domain: homeDomain(homeDir),
      homeDir,
      packageRoot,
      resolveSourceRoot,
    });

    expect(existsSync(resolveRecordPath({ home: homeDir, domain: 'home' }))).toBe(true);
  });

  it('reports a failure in the pass rather than throwing one', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', homeDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');
    // A file where the record's directory belongs, so that the append cannot create it.
    await writeDeployedFile(path.join(homeDir, '.codeassembly', 'deployed-sizes'), 'not a directory');

    const outcome = await recordDeployedSizes({
      plan: planWithSkill('plan', skillsDir),
      domain: homeDomain(homeDir),
      homeDir,
      packageRoot,
      resolveSourceRoot,
    });

    expect(outcome.kind).toBe('failed');
  });

  it('reports the documents that this deployment resized, against the previous snapshot', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', homeDir);
    const bodyPath = path.join(skillsDir, 'plan', 'SKILL.md');
    const before = 'body';
    const after = 'a much longer body than before';
    await writeDeployedFile(bodyPath, before);
    const plan = planWithSkill('plan', skillsDir);
    await recordDeployedSizes({ plan, domain: homeDomain(homeDir), homeDir, packageRoot, resolveSourceRoot });

    await writeDeployedFile(bodyPath, after);
    const outcome = await recordDeployedSizes({
      plan,
      domain: homeDomain(homeDir),
      homeDir,
      packageRoot,
      resolveSourceRoot,
    });

    expect(outcome.kind === 'measured' && outcome.report.changes).toEqual([
      {
        kind: 'resized',
        key: 'claude/skills/plan/SKILL.md',
        bytes: after.length,
        delta: after.length - before.length,
        explained: 0,
      },
    ]);
  });

  it('reports a deployment whose vector is unchanged as changing nothing', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', homeDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');
    const plan = planWithSkill('plan', skillsDir);
    await recordDeployedSizes({ plan, domain: homeDomain(homeDir), homeDir, packageRoot, resolveSourceRoot });

    const outcome = await recordDeployedSizes({
      plan,
      domain: homeDomain(homeDir),
      homeDir,
      packageRoot,
      resolveSourceRoot,
    });

    expect(outcome.kind === 'measured' && outcome.report.changes).toEqual([]);
    expect(outcome.kind === 'measured' && outcome.report.isFirstRecorded).toBe(false);
  });

  it('reports a deployment that the record holds no snapshot for as the first recorded one', async () => {
    const { skillsDir } = resolveHarnessPaths('claude', homeDir);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');

    const outcome = await recordDeployedSizes({
      plan: planWithSkill('plan', skillsDir),
      domain: homeDomain(homeDir),
      homeDir,
      packageRoot,
      resolveSourceRoot,
    });

    expect(outcome.kind === 'measured' && outcome.report.isFirstRecorded).toBe(true);
  });

  it('reports a diff on a feature branch, whose deployment the append gate keeps out of the record', async () => {
    const consumerRoot = await initRepoOnFeatureBranch(scratch);
    const { skillsDir } = resolveHarnessPaths('claude', consumerRoot);
    await writeDeployedFile(path.join(skillsDir, 'plan', 'SKILL.md'), 'body');

    const outcome = await recordDeployedSizes({
      plan: planWithSkill('plan', skillsDir),
      domain: repoDomain(consumerRoot),
      homeDir,
      packageRoot,
      resolveSourceRoot,
    });

    expect(outcome.kind === 'measured' && outcome.report.documentCount).toBe(1);
    expect(existsSync(recordRoot(homeDir))).toBe(false);
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

  it('reports no size line', async () => {
    const outcome = await syncCommand(options({ dryRun: true }), projectRoot, contentDir, homeDir);

    expect(renderReportText(outcome, { dryRun: true })).not.toContain('Deployed sizes:');
  });

  it('leaves the report and the exit path of a live sync unchanged', async () => {
    const outcome = await syncCommand(options(), projectRoot, contentDir, homeDir);

    expect(outcome.kind).toBe('reconciled');
    expect(existsSync(path.join(projectRoot, 'CLAUDE.local.md'))).toBe(true);
  });

  it('closes a live sync with the size block and the command that ranks every document', async () => {
    const outcome = await syncCommand(options(), projectRoot, contentDir, homeDir);
    const report = renderReportText(outcome);

    expect(report).toContain('Deployed sizes:');
    expect(report).toContain('This is the first recorded deployment here');
    expect(report).toContain('Always loaded:');
    expect(report).toContain('On invocation:');
    expect(report).toContain('Assets:');
    expect(report).toContain('Run `codeassembly sizes` to rank every deployed document by size.');
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

/**
 * Builds a disposable repository whose `HEAD` sits on a branch that the default branch does not contain, which is
 * what the append gate refuses. Never the working repository.
 */
async function initRepoOnFeatureBranch(scratch: string): Promise<string> {
  const root = path.join(scratch, 'consumer');
  await git(scratch, ['init', '--quiet', '--initial-branch', 'main', 'consumer']);
  await writeFile(path.join(root, 'file.txt'), 'content\n', 'utf8');
  await git(root, ['add', '.']);
  await commit(root, 'initial');
  await git(root, ['remote', 'add', 'origin', root]);
  await git(root, ['fetch', '--quiet', 'origin']);
  await git(root, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);
  await git(root, ['checkout', '--quiet', '-b', 'feature']);
  await writeFile(path.join(root, 'feature.txt'), 'unmerged\n', 'utf8');
  await git(root, ['add', '.']);
  await commit(root, 'unmerged work');
  return root;
}

/** Sync options for a live run, overridden per test. */
function options(overrides: Partial<InstallOptions> = {}): InstallOptions {
  return { harness: 'claude', link: false, force: false, dryRun: false, ...overrides };
}

/**
 * Plan sources naming one declared skill deployed into `skillsDir`. The skill is authored under `skillsDir` itself,
 * which gives the expansion pass a small content root to walk rather than the directory that the suite runs from.
 */
function planWithSkill(slug: string, skillsDir: string): DeployedPathSources {
  return {
    ambientHosts: [],
    harnessSkillTargets: [{ harnessId: 'claude', skillsDir }],
    harnessSubagentTargets: [],
    resolved: [],
    resolvedSkills: [{ slug, srcDir: path.join(skillsDir, slug), contentRoot: skillsDir, source: undefined }],
    resolvedSubagents: [],
    sourceSupportPlans: [],
    targets: { harnessIds: ['claude'] },
  };
}

/** Every artifact resolves from the library, whose directory these tests never assert against. */
const resolveSourceRoot: ResolveSourceRoot = () => undefined;

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
