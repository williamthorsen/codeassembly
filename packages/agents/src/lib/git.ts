/** The git adapter for the agents package: every git invocation that the package makes, with its parsing. */
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

import { isRecord } from './type-guards.ts';

/** The git queries that the package makes, each returning parsed values. */
export interface AgentsGit {
  /**
   * Returns whether git ignores `filePath` within the repository at `cwd`, or `undefined` when the check cannot answer:
   * git is absent, `cwd` is not a repository, or the check failed. A tracked file is not ignored.
   */
  checkIgnored(cwd: string, filePath: string): Promise<boolean | undefined>;
  /** Returns the root of the working tree containing `cwd`, symlinks resolved, or `undefined` when git supplies none. */
  findTopLevel(cwd: string): Promise<string | undefined>;
  /** Reports whether `HEAD` resolves to a commit in the repository containing `cwd`. */
  hasHeadCommit(cwd: string): boolean;
  /** Reports whether `commit` is an ancestor of `ref`, treating any failure as not. */
  isAncestor(cwd: string, commit: string, ref: string): Promise<boolean>;
  /** Lists every file that `HEAD` records under `cwd`, relative to `cwd`. Throws when `HEAD` is not a commit. */
  listHeadFiles(cwd: string): string[];
  /** Lists the repository's remotes in git's order. Throws when git fails or cannot be spawned. */
  listRemotes(cwd: string): Promise<string[]>;
  /** Returns the commit that `HEAD` is on, or `undefined` when `cwd` is not in a git tree or git is absent. */
  readHeadCommit(cwd: string): Promise<string | undefined>;
  /** Returns the bytes that `HEAD` records for `relativePath`, relative to `cwd`, or `undefined` when it records none. */
  readHeadBlob(cwd: string, relativePath: string): Buffer | undefined;
  /** Returns a remote's fetch URL, or `undefined` when it is empty. Throws when git fails or cannot be spawned. */
  readRemoteUrl(cwd: string, name: string): Promise<string | undefined>;
  /** Returns the short name of the ref to which `ref` points, such as `origin/main`, or `undefined` when it is unset. */
  readSymbolicRef(cwd: string, ref: string): Promise<string | undefined>;
  /** Reports whether `ref` resolves in the repository containing `cwd`. */
  verifyRef(cwd: string, ref: string): Promise<boolean>;
}

/** The adapter that runs git. */
export const realGit: AgentsGit = {
  checkIgnored,
  findTopLevel,
  hasHeadCommit,
  isAncestor,
  listHeadFiles,
  listRemotes,
  readHeadBlob,
  readHeadCommit,
  readRemoteUrl,
  readSymbolicRef,
  verifyRef,
};

// region | Helpers

const execFileAsync = promisify(execFile);

/**
 * Output cap for one synchronous git invocation, sized well past a bundle. The 1 MiB default throws `ENOBUFS` on a
 * larger blob, which `readHeadBlob` cannot distinguish from an absent one, so a recorded bundle would read as absent.
 */
const GIT_MAX_BUFFER = 64 * 1_024 * 1_024;

/** How long a lookup on the sync path may take before it times out without a result. */
const GIT_LOOKUP_TIMEOUT_MS = 5_000;

/** `git check-ignore`'s exit status for a path that it does not ignore, as distinct from a failure to answer at all. */
const NOT_IGNORED_EXIT_CODE = 1;

/** Runs `git check-ignore --quiet`, reading exit 0 as ignored and exit 1 as not ignored. */
async function checkIgnored(cwd: string, filePath: string): Promise<boolean | undefined> {
  try {
    await execFileAsync('git', ['-C', cwd, 'check-ignore', '--quiet', filePath]);
    return true;
  } catch (error: unknown) {
    return isRecord(error) && error['code'] === NOT_IGNORED_EXIT_CODE ? false : undefined;
  }
}

/** Runs `git rev-parse --show-toplevel`. */
async function findTopLevel(cwd: string): Promise<string | undefined> {
  return await readTrimmedOutput(cwd, ['rev-parse', '--show-toplevel']);
}

/** Runs `git rev-parse --verify --quiet HEAD`. */
function hasHeadCommit(cwd: string): boolean {
  try {
    runGitSync(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

/** Runs `git merge-base --is-ancestor`. */
async function isAncestor(cwd: string, commit: string, ref: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['-C', cwd, 'merge-base', '--is-ancestor', commit, ref], {
      timeout: GIT_LOOKUP_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

/** Runs `git ls-tree -r --name-only HEAD -- .`, which lists paths relative to the working directory. */
function listHeadFiles(cwd: string): string[] {
  return runGitSync(cwd, ['ls-tree', '-r', '--name-only', 'HEAD', '--', '.'])
    .toString('utf8')
    .split('\n')
    .filter((line) => line !== '');
}

/** Runs `git remote`. */
async function listRemotes(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, 'remote']);
  return stdout
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/** Runs `git cat-file blob HEAD:./<path>`; the `./` resolves the path against the working directory. */
function readHeadBlob(cwd: string, relativePath: string): Buffer | undefined {
  try {
    return runGitSync(cwd, ['cat-file', 'blob', `HEAD:./${relativePath}`]);
  } catch {
    return;
  }
}

/** Runs `git rev-parse HEAD`. */
async function readHeadCommit(cwd: string): Promise<string | undefined> {
  return await readTrimmedOutput(cwd, ['rev-parse', 'HEAD']);
}

/** Runs `git remote get-url`. */
async function readRemoteUrl(cwd: string, name: string): Promise<string | undefined> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, 'remote', 'get-url', name]);
  const url = stdout.trim();
  return url === '' ? undefined : url;
}

/** Runs `git rev-parse --abbrev-ref`. */
async function readSymbolicRef(cwd: string, ref: string): Promise<string | undefined> {
  return await readTrimmedOutput(cwd, ['rev-parse', '--abbrev-ref', ref]);
}

/** Runs a lookup under the timeout, returning its trimmed stdout, or `undefined` when it fails or prints nothing. */
async function readTrimmedOutput(cwd: string, args: readonly string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { timeout: GIT_LOOKUP_TIMEOUT_MS });
    const output = stdout.trim();
    return output === '' ? undefined : output;
  } catch {
    return undefined;
  }
}

/** Runs git in `cwd` and returns its stdout, discarding stderr. Throws when git exits non-zero. */
function runGitSync(cwd: string, args: readonly string[]): Buffer {
  return execFileSync('git', args, { cwd, maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
}

/** Runs `git rev-parse --verify`. */
async function verifyRef(cwd: string, ref: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['-C', cwd, 'rev-parse', '--verify', ref], { timeout: GIT_LOOKUP_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

// endregion | Helpers
