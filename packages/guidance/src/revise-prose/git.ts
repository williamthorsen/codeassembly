/** The git adapter for the revise-prose helper: every git invocation that the helper makes, with its parsing. */
import { execFileSync } from 'node:child_process';

/** The git queries that the helper makes, each returning parsed values. */
export interface ReviseProseGit {
  /**
   * Lists tracked files and untracked, non-ignored files under the paths, deduplicated, repository-relative, in git's
   * order; an empty list covers the repository. Throws when git fails, as it does outside a working tree.
   */
  listFiles(root: string, paths: readonly string[]): string[];
}

/** The adapter that runs git. */
export const realGit: ReviseProseGit = {
  listFiles,
};

// region | Helpers

/** Output cap for one `git ls-files`, sized past the listing produced by a large repository. */
const GIT_MAX_BUFFER = 256 * 1_024 * 1_024;

/** Runs both `git ls-files` forms, tracked and untracked-but-not-ignored, and merges their paths. */
function listFiles(root: string, paths: readonly string[]): string[] {
  const listed = [...runLsFiles(root, [], paths), ...runLsFiles(root, ['--others', '--exclude-standard'], paths)];
  return [...new Set(listed)];
}

/** Runs one `git ls-files` form under `root`, returning repository-relative paths. */
function runLsFiles(root: string, options: readonly string[], paths: readonly string[]): string[] {
  return execFileSync('git', ['ls-files', '-z', ...options, '--', ...paths], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .split('\0')
    .filter((file) => file !== '');
}

// endregion | Helpers
