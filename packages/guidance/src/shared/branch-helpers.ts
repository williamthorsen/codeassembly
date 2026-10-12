/** Git-branch resolution and filesystem sanitization, shared across skill modules. */
import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { realGit, type SharedGit } from './git.ts';

/**
 * Resolves the current branch name at `cwd`. Throws when git fails: a missing git binary, or a `cwd` outside a
 * repository. A detached HEAD is not a failure: git reports an empty string, which is returned verbatim so that each
 * caller decides whether to refuse it or fall back.
 */
export async function resolveCurrentBranch(cwd: string, git: SharedGit = realGit): Promise<string> {
  try {
    return await git.findCurrentBranch(cwd);
  } catch (error) {
    throw chainError('Could not resolve current branch (is this a git repository?)', error);
  }
}

/**
 * Sanitizes a branch name for filesystem use: replace `/` with `-`, trim trailing `-`. The transform must match
 * `resolve-frontmatter.sh`'s, or a previously-written manifest becomes unreachable. Underscores are preserved; see
 * `_data/branch-format.md`.
 */
export function sanitizeBranch(branch: string): string {
  let sanitized = branch.trim().replaceAll('/', '-');
  while (sanitized.endsWith('-')) {
    sanitized = sanitized.slice(0, -1);
  }
  return sanitized;
}
