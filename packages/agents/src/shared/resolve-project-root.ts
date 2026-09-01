import { execFileSync } from 'node:child_process';
import process from 'node:process';

import { isRecord } from '../lib/type-guards.ts';

/** Options controlling how the project root is resolved. */
interface ResolveProjectRootOptions {
  /** Caller-supplied base (e.g. from a `--cwd` flag). When set and non-empty, it is returned verbatim. */
  readonly cwd?: string | null;
  /** Directory the git-root discovery runs from. Defaults to the ambient working directory. */
  readonly startDir?: string;
}

/** The git working-tree root, or the diagnostic git produced when it could not supply one. */
type GitToplevelResult = { readonly root: string } | { readonly failure: string };

/**
 * Resolves the directory that repo-relative helper paths (`.agents/`, etc.) should anchor against, so a helper is
 * correct from any subdirectory of the repo regardless of where the agent happened to invoke it.
 *
 * Precedence, highest first:
 *   1. An explicit `cwd` override, used verbatim with no git invocation.
 *   2. The git repo root (`git rev-parse --show-toplevel`, which is worktree-aware).
 *   3. The ambient working directory, as a last resort, accompanied by a one-line stderr diagnostic quoting git.
 *
 * The diagnostic names git as the failing party and carries git's own message, because the failure has causes beyond
 * an absent repository: A repository git cannot read produces the same empty answer, and asserting the wrong one
 * sends the reader after a repository that is already there.
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
  const result = tryGitToplevel(startDir);
  if ('root' in result) {
    return result.root;
  }
  process.stderr.write(
    `resolve-project-root: git could not resolve the repository root (${result.failure}); anchoring at ${startDir}. ` +
      `Repo-relative paths may be wrong if the working directory changed.\n`,
  );
  return startDir;
}

// region | Helpers

/** Extracts git's own message from a failed `execFileSync` call, falling back to the thrown error's own text. */
function describeGitFailure(error: unknown): string {
  const stderr = isRecord(error) ? error.stderr : undefined;
  if (typeof stderr === 'string' && stderr.trim() !== '') {
    return stderr.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

/** Runs `git rev-parse --show-toplevel` from `startDir`, reporting git's own diagnostic when it cannot answer. */
function tryGitToplevel(startDir: string): GitToplevelResult {
  try {
    const stdout = execFileSync('git', ['-C', startDir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const root = stdout.trim();
    return root === '' ? { failure: 'git returned an empty working-tree root' } : { root };
  } catch (error) {
    return { failure: describeGitFailure(error) };
  }
}

// endregion | Helpers
