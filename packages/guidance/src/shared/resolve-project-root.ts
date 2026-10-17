import process from 'node:process';

import { realGit, type SharedGit } from './git.ts';

/** Options controlling how the project root is resolved. */
interface ResolveProjectRootOptions {
  /** Caller-supplied base (e.g. from a `--cwd` flag). When set and non-empty, it is returned verbatim. */
  readonly cwd?: string | null;
  /** The git adapter that discovers the root. */
  readonly git?: SharedGit;
  /** Directory the git-root discovery runs from. Defaults to the ambient working directory. */
  readonly startDir?: string;
}

/**
 * Resolves the directory that repo-relative helper paths (`.agents/`, etc.) should anchor against, so a helper is
 * correct from any subdirectory of the repo regardless of where the agent happened to invoke it.
 *
 * Precedence, highest first:
 *   1. An explicit `cwd` override, used verbatim without invoking git.
 *   2. The git repo root, which is worktree-aware.
 *   3. The ambient working directory, as a last resort, accompanied by a one-line stderr diagnostic quoting git.
 *
 * The diagnostic names git as the failing party and includes git's own message, because the failure has causes beyond
 * an absent repository: A repository that git cannot read produces the same empty answer, and asserting the
 * wrong cause leads the reader to look for a repository that is already there.
 *
 * The diagnostic is written to stderr only: Callers such as `derive-session-context` emit machine-readable output on
 * stdout, so a stray stdout write would corrupt it.
 */
export function resolveProjectRoot(options: ResolveProjectRootOptions = {}): string {
  const { cwd } = options;
  if (cwd !== null && cwd !== undefined && cwd !== '') {
    return cwd;
  }
  const startDir = options.startDir ?? process.cwd();
  const result = (options.git ?? realGit).findTopLevel(startDir);
  if ('root' in result) {
    return result.root;
  }
  process.stderr.write(
    `resolve-project-root: git could not resolve the repository root (${result.failure}); anchoring at ${startDir}. ` +
      `Repo-relative paths may be wrong if the working directory changed.\n`,
  );
  return startDir;
}
