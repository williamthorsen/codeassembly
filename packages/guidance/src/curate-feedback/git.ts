/** The git adapter for the curate-feedback helper: every git invocation that the helper makes. */
import { execFileSync } from 'node:child_process';

/** The git operations that the helper performs, each returning `undefined` when git fails. */
export interface CurateGit {
  /** Fetches `branch` from `origin` and returns the SHA of `origin/{branch}`. */
  fetchBranchHead(root: string, branch: string): string | undefined;
  /** Returns the branch that `origin/HEAD` names, asking the remote when the local ref is not set. */
  findDefaultBranch(root: string): string | undefined;
  /** Returns git's top-level path for `dir`, or `undefined` when `dir` is not inside a working tree. */
  findTopLevel(dir: string): string | undefined;
  /** Reports whether `file`, relative to the repository root, exists at `sha`. */
  hasFileAt(root: string, sha: string, file: string): boolean;
  /** Returns the configured `origin` URL as written, before any `insteadOf` rewriting. */
  readOriginUrl(root: string): string | undefined;
}

/** The adapter that runs git. */
export const realGit: CurateGit = {
  fetchBranchHead,
  findDefaultBranch,
  findTopLevel,
  hasFileAt,
  readOriginUrl,
};

// region | Helpers

/** Fetches the branch quietly, then resolves its remote-tracking ref. */
function fetchBranchHead(root: string, branch: string): string | undefined {
  if (runGit(root, ['fetch', '--quiet', 'origin', branch]) === undefined) return undefined;
  return runGit(root, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`])?.trim() || undefined;
}

/** Reads `origin/HEAD` locally, falling back to `ls-remote --symref`, which a clone without the local ref needs. */
function findDefaultBranch(root: string): string | undefined {
  const local = runGit(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])?.trim();
  if (local !== undefined && local.startsWith('origin/')) return local.slice('origin/'.length);
  const remote = runGit(root, ['ls-remote', '--symref', 'origin', 'HEAD']);
  const match = remote === undefined ? null : /^ref: refs\/heads\/(\S+)\s+HEAD$/m.exec(remote);
  return match?.[1];
}

/** Asks git for the working tree's top level. */
function findTopLevel(dir: string): string | undefined {
  return runGit(dir, ['rev-parse', '--show-toplevel'])?.trim() || undefined;
}

/** Checks for the blob with `cat-file -e`, which prints nothing and reports through its exit status. */
function hasFileAt(root: string, sha: string, file: string): boolean {
  return runGit(root, ['cat-file', '-e', `${sha}:${file}`]) !== undefined;
}

/** Reads the raw config value, since `git remote get-url` applies `insteadOf` rewriting. */
function readOriginUrl(root: string): string | undefined {
  return runGit(root, ['config', '--get', 'remote.origin.url'])?.trim() || undefined;
}

/** Runs git in `cwd`, returning its stdout, or `undefined` when it exits non-zero or cannot start. */
function runGit(cwd: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return undefined;
  }
}

// endregion | Helpers
