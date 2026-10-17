/** Reports the checked-out branch's position relative to a freshly fetched remote default branch. */
import { execFileSync } from 'node:child_process';
import process from 'node:process';

import { isRecord } from '../lib/type-guards.ts';

/** A commit that the base gained and the branch lacks. */
export interface GainedCommit {
  sha: string;
  subject: string;
  /** Whether the commit changes any of the work's paths, or `null` when the caller passed none. */
  touchesWork: boolean | null;
}

/** The outcome of a currency check: a failed fetch, or the branch's position relative to the fetched base. */
export type BranchCurrency =
  | { fetched: false; error: string }
  | {
      fetched: true;
      base: string;
      behind: number;
      ahead: number;
      clean: boolean;
      pushed: boolean;
      gained: GainedCommit[];
    };

/** Inputs to a currency check. */
export interface CheckOptions {
  /** The remote-qualified default branch, such as `origin/main`. */
  base: string;
  cwd: string;
  /** Repository-root-relative paths that the work touches. */
  paths: readonly string[];
}

/**
 * Fetches the base and reports how far the branch is behind and ahead of it, whether its tree is clean, whether its
 * upstream contains any of its own commits, and which commits the base gained. Throws when a git command after the
 * fetch fails, so that a failure is never mistaken for a result.
 */
export function checkBranchCurrency(options: CheckOptions): BranchCurrency {
  const { base, cwd, paths } = options;
  const { remote, branch } = splitBase(base);

  const fetched = fetchBranch(cwd, remote, branch);
  if (!fetched.ok) {
    return { fetched: false, error: fetched.error };
  }

  const behind = countCommits(cwd, `HEAD..${base}`);
  const ahead = countCommits(cwd, `${base}..HEAD`);
  const clean = readGit(cwd, ['status', '--porcelain']) === '';
  const pushed = hasPushedOwnCommits(cwd, base);
  const gained = listGainedCommits(cwd, base, paths);

  return { fetched: true, base, behind, ahead, clean, pushed, gained };
}

/** Splits a remote-qualified branch at its first `/`. Throws when either part is empty. */
export function splitBase(base: string): { remote: string; branch: string } {
  const separatorIndex = base.indexOf('/');
  const remote = base.slice(0, Math.max(0, separatorIndex));
  const branch = base.slice(separatorIndex + 1);
  if (separatorIndex === -1 || remote === '' || branch === '') {
    throw new Error(`--base must name a remote and a branch, such as origin/main: ${base}`);
  }
  return { remote, branch };
}

// region | Helpers

/** The revision syntax that names the checked-out branch's upstream. */
const UPSTREAM = '@{u}';

/** Returns the number of commits in `range`. */
function countCommits(cwd: string, range: string): number {
  return Number.parseInt(readGit(cwd, ['rev-list', '--count', range]), 10);
}

/** Extracts git's own message from a failed `execFileSync` call, falling back to the thrown error's own text. */
function describeGitFailure(error: unknown): string {
  const stderr = isRecord(error) ? error.stderr : undefined;
  if (typeof stderr === 'string' && stderr.trim() !== '') {
    return stderr.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

/** Runs `git fetch` with terminal prompts disabled, so that a credential prompt fails rather than waits. */
function fetchBranch(cwd: string, remote: string, branch: string): { ok: true } | { ok: false; error: string } {
  try {
    execFileSync('git', ['-C', cwd, 'fetch', '--quiet', remote, branch], {
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describeGitFailure(error) };
  }
}

/** Returns true when the branch has an upstream that contains commits beyond the base. */
function hasPushedOwnCommits(cwd: string, base: string): boolean {
  if (!hasUpstream(cwd)) {
    return false;
  }
  return countCommits(cwd, base + '..' + UPSTREAM) > 0;
}

/** Returns true when the checked-out branch has an upstream, which git reports by failing to resolve `@{u}`. */
function hasUpstream(cwd: string): boolean {
  try {
    readGit(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', UPSTREAM]);
    return true;
  } catch {
    return false;
  }
}

/** Lists the commits in the base that HEAD lacks, newest first, marking those that touch the given paths. */
function listGainedCommits(cwd: string, base: string, paths: readonly string[]): GainedCommit[] {
  const range = `HEAD..${base}`;
  const log = readGit(cwd, ['log', '--format=%H%x09%s', range]);
  const commits = log === '' ? [] : log.split('\n').map((line) => parseLogLine(line));

  if (paths.length === 0) {
    return commits.map((commit) => ({ ...commit, touchesWork: null }));
  }

  // Anchor each pathspec at the repository root and match it literally, whatever directory the helper runs in.
  const pathspecs = paths.map((workPath) => `:(top,literal)${workPath}`);
  const touching = new Set(readGit(cwd, ['log', '--format=%H', range, '--', ...pathspecs]).split('\n'));
  return commits.map((commit) => ({ ...commit, touchesWork: touching.has(commit.sha) }));
}

/** Splits a `%H<TAB>%s` log line into its SHA and subject. */
function parseLogLine(line: string): { sha: string; subject: string } {
  const tabIndex = line.indexOf('\t');
  return { sha: line.slice(0, tabIndex), subject: line.slice(tabIndex + 1) };
}

/** Runs a read-only git command and returns its trimmed stdout. Throws with git's message when git exits non-zero. */
function readGit(cwd: string, args: readonly string[]): string {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw new Error(`git ${args.join(' ')} failed: ${describeGitFailure(error)}`, { cause: error });
  }
}

// endregion | Helpers
