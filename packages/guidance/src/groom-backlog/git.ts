/**
 * The git adapter for the backlog helpers, groom-backlog and pull-from-backlog: every git invocation that they make,
 * with its parsing.
 */
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import type { Commit } from './types.ts';

/** The git queries that the backlog helpers make, each returning parsed values. Each throws when git fails, unless noted. */
export interface BacklogGit {
  /** Returns the number of commits reachable from `ref` and not from `base`. */
  countCommitsAhead(cwd: string, base: string, ref: string): Promise<number>;
  /** Returns the absolute path of the repository's common git directory, shared by every worktree. */
  findCommonDir(cwd: string): Promise<string>;
  /**
   * Returns the branch to which `origin/HEAD` points, without its `refs/remotes/origin/` prefix, or undefined when the
   * remote does not record one or git fails.
   */
  findOriginHead(cwd: string): Promise<string | undefined>;
  /** Returns the short SHA of `HEAD`. */
  findShortSha(cwd: string): Promise<string>;
  /** Reports whether the full ref names a commit; any git failure reads as false. */
  hasRef(cwd: string, ref: string): Promise<boolean>;
  /** Returns each local and remote-tracking branch's tip committer date, in ISO form, by full ref name. */
  listBranchTips(cwd: string): Promise<Map<string, string>>;
  /** Returns the commits on `ref` committed since the ISO date `since`, newest first. */
  listCommitsSince(cwd: string, ref: string, since: string): Promise<Commit[]>;
  /** Returns every worktree's path with its full `refs/heads/` branch, which is undefined on a detached HEAD. */
  listWorktrees(cwd: string): Promise<Worktree[]>;
}

/** One worktree of the repository. */
export interface Worktree {
  branchRef: string | undefined;
  path: string;
}

/** The adapter that runs git. */
export const realGit: BacklogGit = {
  countCommitsAhead,
  findCommonDir,
  findOriginHead,
  findShortSha,
  hasRef,
  listBranchTips,
  listCommitsSince,
  listWorktrees,
};

// region | Helpers

const execFileAsync = promisify(execFile);

/** Separates one commit's fields in the log format. */
const FIELD_SEPARATOR = '\u{1F}';

/** Output cap for one git invocation, sized past a long log or a repository with many branches. */
const GIT_MAX_BUFFER = 256 * 1_024 * 1_024;

const ORIGIN_PREFIX = 'refs/remotes/origin/';

/** Runs `git rev-list --count` over the range. */
async function countCommitsAhead(cwd: string, base: string, ref: string): Promise<number> {
  return Number((await runGit(cwd, ['rev-list', '--count', `${base}..${ref}`])).trim());
}

/** Runs `git rev-parse --git-common-dir`, which prints a path relative to `cwd` from the primary worktree. */
async function findCommonDir(cwd: string): Promise<string> {
  return path.resolve(cwd, (await runGit(cwd, ['rev-parse', '--git-common-dir'])).trim());
}

/** Runs `git symbolic-ref` on `origin/HEAD`. */
async function findOriginHead(cwd: string): Promise<string | undefined> {
  try {
    const ref = (await runGit(cwd, ['symbolic-ref', '--quiet', `${ORIGIN_PREFIX}HEAD`])).trim();
    return ref.startsWith(ORIGIN_PREFIX) ? ref.slice(ORIGIN_PREFIX.length) : undefined;
  } catch {
    return undefined;
  }
}

/** Runs `git rev-parse --short HEAD`. */
async function findShortSha(cwd: string): Promise<string> {
  return (await runGit(cwd, ['rev-parse', '--short', 'HEAD'])).trim();
}

/** Runs `git rev-parse --verify` on the ref. */
async function hasRef(cwd: string, ref: string): Promise<boolean> {
  try {
    await runGit(cwd, ['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

/** Runs `git for-each-ref` over local and remote-tracking branches. */
async function listBranchTips(cwd: string): Promise<Map<string, string>> {
  const stdout = await runGit(cwd, [
    'for-each-ref',
    '--format=%(refname)%09%(committerdate:iso-strict)',
    'refs/heads/',
    'refs/remotes/',
  ]);
  const tips = new Map<string, string>();
  for (const line of stdout.split('\n')) {
    const [ref, date] = line.split('\t', 2);
    if (ref !== undefined && ref !== '' && date !== undefined) tips.set(ref, date);
  }
  return tips;
}

/**
 * Runs `git log` on the ref. The format is explicit, so a configured `format.pretty` or signature display cannot change
 * what is parsed.
 */
async function listCommitsSince(cwd: string, ref: string, since: string): Promise<Commit[]> {
  const stdout = await runGit(cwd, [
    'log',
    ref,
    '--no-show-signature',
    `--since=${since}`,
    `--format=%h${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%cI`,
  ]);
  const commits: Commit[] = [];
  for (const line of stdout.split('\n')) {
    const [sha, subject, date] = line.split(FIELD_SEPARATOR, 3);
    if (sha !== undefined && sha !== '' && subject !== undefined && date !== undefined) {
      commits.push({ date, sha, subject });
    }
  }
  return commits;
}

/** Runs `git worktree list --porcelain`, whose records are separated by blank lines. */
async function listWorktrees(cwd: string): Promise<Worktree[]> {
  const porcelain = await runGit(cwd, ['worktree', 'list', '--porcelain']);
  const worktrees: Worktree[] = [];
  for (const block of porcelain.split('\n\n')) {
    const worktreePath = /^worktree (.+)$/m.exec(block)?.[1];
    if (worktreePath === undefined) continue;
    worktrees.push({ branchRef: /^branch (.+)$/m.exec(block)?.[1], path: worktreePath });
  }
  return worktrees;
}

/** Runs git in a directory and resolves to its stdout. */
async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', [...args], { cwd, maxBuffer: GIT_MAX_BUFFER });
  return stdout;
}

// endregion | Helpers
