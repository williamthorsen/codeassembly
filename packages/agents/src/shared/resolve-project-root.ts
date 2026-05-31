import { execFileSync } from 'node:child_process';
import process from 'node:process';

/** Options controlling how the project root is resolved. */
interface ResolveProjectRootOptions {
  /** Caller-supplied base (e.g. from a `--cwd` flag). When set and non-empty, it is returned verbatim. */
  readonly cwd?: string | null;
  /** Directory the git-root discovery runs from. Defaults to the ambient working directory. */
  readonly startDir?: string;
}

/**
 * Resolves the directory that repo-relative helper paths (`.agents/`, etc.) should anchor against, so a helper is
 * correct from any subdirectory of the repo regardless of where the agent happened to invoke it.
 *
 * Precedence, highest first:
 *   1. An explicit `cwd` override, used verbatim with no git invocation.
 *   2. The git repo root (`git rev-parse --show-toplevel`, which is worktree-aware).
 *   3. The ambient working directory, as a last resort, accompanied by a one-line stderr diagnostic.
 *
 * The diagnostic is written to stderr only: callers such as `derive-session-context` emit machine-readable output on
 * stdout, so a stray stdout write would corrupt it. The branches are ordered so a future captured-invocation-directory
 * tier can be inserted ahead of the git-root check without disturbing the others.
 */
export function resolveProjectRoot(options: ResolveProjectRootOptions = {}): string {
  const { cwd } = options;
  if (cwd !== null && cwd !== undefined && cwd !== '') {
    return cwd;
  }
  const startDir = options.startDir ?? process.cwd();
  const gitRoot = tryGitToplevel(startDir);
  if (gitRoot !== null) {
    return gitRoot;
  }
  process.stderr.write(
    `resolve-project-root: not inside a git repository; anchoring at ${startDir}. ` +
      `Repo-relative paths may be wrong if the working directory changed.\n`,
  );
  return startDir;
}

/** Returns the git working-tree root for `startDir`, or `null` when `startDir` is not inside a git repository. */
function tryGitToplevel(startDir: string): string | null {
  try {
    const stdout = execFileSync('git', ['-C', startDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
