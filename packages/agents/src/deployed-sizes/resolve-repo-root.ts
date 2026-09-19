import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** How long the lookup may take before it answers with nothing. */
const GIT_LOOKUP_TIMEOUT_MS = 5_000;

/**
 * Resolves the root of the git working tree containing `startDir`, with its symlinks already resolved, or
 * `undefined` when git supplies none: a directory outside a repository, a repository that git cannot read, or a
 * machine with no `git` binary.
 *
 * Silent on every failure, and distinct from `resolveProjectRoot` for that reason: A sync outside a repository is
 * ordinary, and its report may simply withhold what it cannot attribute rather than write a diagnostic every time.
 */
export async function resolveRepoRoot(startDir: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', startDir, 'rev-parse', '--show-toplevel'], {
      timeout: GIT_LOOKUP_TIMEOUT_MS,
    });
    const root = stdout.trim();
    return root === '' ? undefined : root;
  } catch {
    return undefined;
  }
}
