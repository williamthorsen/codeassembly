/** Git-branch resolution and filesystem sanitization, shared across skill modules. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

const execFileAsync = promisify(execFile);

/**
 * Resolves the current branch name via `git -C {cwd} branch --show-current`. Throws when git cannot answer — no git
 * binary, or `cwd` outside a repository. A detached HEAD is not a failure: git reports an empty string, which is
 * returned verbatim so each caller decides whether to refuse it or fall back.
 */
export async function resolveCurrentBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, 'branch', '--show-current']);
    return stdout.trim();
  } catch (error) {
    throw chainError('Could not resolve current branch (is this a git repository?)', error);
  }
}

/**
 * Sanitizes a branch name for filesystem use: replace `/` with `-`, trim trailing `-`.
 * Mirrors the sanitization performed by `resolve-frontmatter.sh` so previously-written manifests
 * remain reachable. Underscores are deliberately preserved (see `_data/branch-format.md`).
 */
export function sanitizeBranch(branch: string): string {
  let sanitized = branch.trim().replaceAll('/', '-');
  while (sanitized.endsWith('-')) {
    sanitized = sanitized.slice(0, -1);
  }
  return sanitized;
}
