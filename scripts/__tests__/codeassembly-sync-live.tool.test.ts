import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const scriptSource = path.join(import.meta.dirname, '..', 'codeassembly-sync-live.sh');

const expectedSteps = [
  'pnpm install --frozen-lockfile',
  'pnpm exec nmr build',
  'codeassembly install --link --force',
  'codeassembly sync --global',
];

describe('codeassembly-sync-live', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => {
    rmSync(fixture.baseDir, { recursive: true, force: true });
  });

  it('advances live to origin/main and deploys from the live worktree', () => {
    const target = commitAndPush(fixture, 'second');

    const result = runSyncLive(fixture);

    expect(result.status).toBe(0);
    expect(readHead(fixture.liveDir)).toBe(target);
    expect(result.stdout).toContain(`to ${target.slice(0, 8)} (origin/main)`);
    expect(readDeployLog(fixture)).toStrictEqual(expectedSteps.map((step) => `${step}|${fixture.liveDir}`));
  });

  it('advances live to an explicit commit', () => {
    const target = commitAndPush(fixture, 'second');
    commitAndPush(fixture, 'third');

    const result = runSyncLive(fixture, [target]);

    expect(result.status).toBe(0);
    expect(readHead(fixture.liveDir)).toBe(target);
  });

  it('deploys when live is already at the commit', () => {
    const result = runSyncLive(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('live is already at');
    expect(readDeployLog(fixture)).toHaveLength(expectedSteps.length);
  });

  it('refuses an unknown ref with exit 2', () => {
    const before = readHead(fixture.liveDir);

    const result = runSyncLive(fixture, ['no-such-ref']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown ref 'no-such-ref'");
    expect(readHead(fixture.liveDir)).toBe(before);
    expect(readDeployLog(fixture)).toStrictEqual([]);
  });

  it('refuses when live cannot fast-forward', () => {
    commitAndPush(fixture, 'second');
    writeFileSync(path.join(fixture.liveDir, 'diverged.txt'), 'diverged\n');
    runGit(fixture.liveDir, ['add', 'diverged.txt']);
    runGit(fixture.liveDir, ['commit', '--message', 'diverged']);
    const before = readHead(fixture.liveDir);

    const result = runSyncLive(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('live cannot fast-forward');
    expect(readHead(fixture.liveDir)).toBe(before);
    expect(readDeployLog(fixture)).toStrictEqual([]);
  });

  it('refuses when the live worktree has uncommitted changes', () => {
    commitAndPush(fixture, 'second');
    writeFileSync(path.join(fixture.liveDir, 'stray.txt'), 'stray\n');
    const before = readHead(fixture.liveDir);

    const result = runSyncLive(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('has uncommitted changes');
    expect(readHead(fixture.liveDir)).toBe(before);
    expect(readDeployLog(fixture)).toStrictEqual([]);
  });

  it('names the deploy step that fails and stops', () => {
    const result = runSyncLive(fixture, [], { STUB_PNPM_FAIL_ON: 'nmr' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("deploy step 'build' failed");
    expect(readDeployLog(fixture)).toStrictEqual([
      `${expectedSteps[0]}|${fixture.liveDir}`,
      `${expectedSteps[1]}|${fixture.liveDir}`,
    ]);
  });
});

// region | Helpers

interface Fixture {
  baseDir: string;
  logPath: string;
  liveDir: string;
  repoDir: string;
  stubBinDir: string;
}

/** Adds an empty commit to the fixture's main branch, pushes it to origin, and returns its SHA. */
function commitAndPush(fixture: Fixture, message: string): string {
  runGit(fixture.repoDir, ['commit', '--allow-empty', '--message', message]);
  runGit(fixture.repoDir, ['push', '--quiet', 'origin', 'main']);
  return readHead(fixture.repoDir);
}

/**
 * Builds a scratch repository whose main branch contains a copy of the script and a stub agents bin, with a bare
 * origin, a live worktree, and a stub pnpm. Both stubs append their arguments and working directory to a log.
 */
function createFixture(): Fixture {
  const baseDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'sync-live-')));
  const originDir = path.join(baseDir, 'origin.git');
  const repoDir = path.join(baseDir, 'repo');
  const liveDir = path.join(baseDir, 'repo.live');
  const stubBinDir = path.join(baseDir, 'stub-bin');
  const logPath = path.join(baseDir, 'deploy.log');

  runGit(baseDir, ['init', '--quiet', '--bare', '--initial-branch=main', originDir]);
  runGit(baseDir, ['init', '--quiet', '--initial-branch=main', repoDir]);

  const scriptPath = path.join(repoDir, 'scripts', 'codeassembly-sync-live.sh');
  mkdirSync(path.dirname(scriptPath), { recursive: true });
  copyFileSync(scriptSource, scriptPath);
  chmodSync(scriptPath, 0o755);

  const binPath = path.join(repoDir, 'packages', 'agents', 'bin', 'codeassembly.js');
  mkdirSync(path.dirname(binPath), { recursive: true });
  writeFileSync(
    binPath,
    [
      "import { appendFileSync } from 'node:fs';",
      "appendFileSync(process.env.SYNC_LIVE_LOG, `codeassembly ${process.argv.slice(2).join(' ')}|${process.cwd()}\\n`);",
      '',
    ].join('\n'),
  );
  writeFileSync(path.join(repoDir, 'package.json'), '{ "type": "module" }\n');

  runGit(repoDir, ['add', '.']);
  runGit(repoDir, ['commit', '--quiet', '--message', 'initial']);
  runGit(repoDir, ['remote', 'add', 'origin', originDir]);
  runGit(repoDir, ['push', '--quiet', 'origin', 'main']);
  runGit(repoDir, ['worktree', 'add', '--quiet', '-b', 'live', liveDir, 'main']);

  mkdirSync(stubBinDir);
  const pnpmPath = path.join(stubBinDir, 'pnpm');
  writeFileSync(
    pnpmPath,
    [
      '#!/usr/bin/env bash',
      'echo "pnpm $*|$PWD" >> "$SYNC_LIVE_LOG"',
      'if [[ -n "${STUB_PNPM_FAIL_ON:-}" && " $* " == *" $STUB_PNPM_FAIL_ON "* ]]; then exit 1; fi',
      '',
    ].join('\n'),
  );
  chmodSync(pnpmPath, 0o755);

  return { baseDir, liveDir, logPath, repoDir, stubBinDir };
}

/** Reads the deploy steps recorded by the stubs, one `<command>|<cwd>` entry per step. */
function readDeployLog(fixture: Fixture): string[] {
  if (!existsSync(fixture.logPath)) return [];
  return readFileSync(fixture.logPath, 'utf8').trim().split('\n');
}

/** Reads the SHA at HEAD in a worktree. */
function readHead(dir: string): string {
  return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

/** Runs git in a directory with a fixed identity and signing disabled. */
function runGit(dir: string, args: string[]): void {
  execFileSync(
    'git',
    ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args],
    { stdio: 'pipe' },
  );
}

/** Runs the fixture's copy of the script from the base directory, with the stub pnpm first on `PATH`. */
function runSyncLive(fixture: Fixture, args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync(path.join(fixture.repoDir, 'scripts', 'codeassembly-sync-live.sh'), args, {
    cwd: fixture.baseDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.stubBinDir}${path.delimiter}${process.env.PATH ?? ''}`,
      SYNC_LIVE_LOG: fixture.logPath,
      ...env,
    },
  });
}

// endregion | Helpers
