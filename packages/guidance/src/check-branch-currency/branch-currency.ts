/** Reports how the checked-out branch stands against a freshly fetched remote default branch. */
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

/** The git queries that the currency check makes, each run in the given working tree. */
export interface CurrencyGit {
  /** Fetches `branch` from `remote`, returning git's trimmed stderr on failure. */
  fetch(cwd: string, remote: string, branch: string): { ok: true } | { ok: false; error: string };
  /** Runs a read-only git command and returns its trimmed stdout, or `undefined` when git exits non-zero. */
  read(cwd: string, args: readonly string[]): string | undefined;
}

/** Inputs to a currency check. */
export interface CheckOptions {
  /** The remote-qualified default branch, such as `origin/main`. */
  base: string;
  cwd: string;
  /** Repository-root-relative paths that the work touches. */
  paths: readonly string[];
}

/** The adapter that runs git. */
export const realCurrencyGit: CurrencyGit = {
  fetch: fetchBranch,
  read: readGit,
};

/**
 * Fetches the base and reports how far the branch is behind and ahead of it, whether its tree is clean, whether its
 * upstream holds any of its own commits, and which commits the base gained.
 */
export function checkBranchCurrency(options: CheckOptions, git: CurrencyGit = realCurrencyGit): BranchCurrency {
  const { base, cwd, paths } = options;
  const { remote, branch } = splitBase(base);

  const fetched = git.fetch(cwd, remote, branch);
  if (!fetched.ok) {
    return { fetched: false, error: fetched.error };
  }

  const behind = countCommits(git, cwd, `HEAD..${base}`);
  const ahead = countCommits(git, cwd, `${base}..HEAD`);
  const clean = (git.read(cwd, ['status', '--porcelain']) ?? '') === '';
  const pushed = hasPushedOwnCommits(git, cwd, base);
  const gained = listGainedCommits(git, cwd, base, paths);

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

/** Returns the number of commits in `range`; throws when git cannot resolve it. */
function countCommits(git: CurrencyGit, cwd: string, range: string): number {
  const output = git.read(cwd, ['rev-list', '--count', range]);
  if (output === undefined) {
    throw new Error(`git could not count the commits in ${range}`);
  }
  return Number.parseInt(output, 10);
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
function hasPushedOwnCommits(git: CurrencyGit, cwd: string, base: string): boolean {
  if (git.read(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', UPSTREAM]) === undefined) {
    return false;
  }
  return countCommits(git, cwd, base + '..' + UPSTREAM) > 0;
}

/** Lists the commits in the base that HEAD lacks, newest first, marking those that touch the given paths. */
function listGainedCommits(git: CurrencyGit, cwd: string, base: string, paths: readonly string[]): GainedCommit[] {
  const range = `HEAD..${base}`;
  const log = git.read(cwd, ['log', '--format=%H%x09%s', range]) ?? '';
  const commits = log === '' ? [] : log.split('\n').map((line) => parseLogLine(line));

  if (paths.length === 0) {
    return commits.map((commit) => ({ ...commit, touchesWork: null }));
  }

  // Anchor each pathspec at the repository root and match it literally, whatever directory the helper runs in.
  const pathspecs = paths.map((workPath) => `:(top,literal)${workPath}`);
  const touching = new Set((git.read(cwd, ['log', '--format=%H', range, '--', ...pathspecs]) ?? '').split('\n'));
  return commits.map((commit) => ({ ...commit, touchesWork: touching.has(commit.sha) }));
}

/** Splits a `%H<TAB>%s` log line into its SHA and subject. */
function parseLogLine(line: string): { sha: string; subject: string } {
  const tabIndex = line.indexOf('\t');
  return { sha: line.slice(0, tabIndex), subject: line.slice(tabIndex + 1) };
}

/** Runs git and returns its trimmed stdout, or `undefined` when git exits non-zero. */
function readGit(cwd: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return undefined;
  }
}

// endregion | Helpers
