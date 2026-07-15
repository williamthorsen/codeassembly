/** Best-effort `owner/name` resolution of the git remote at a working directory, shared across skill modules. */
import { execFile } from 'node:child_process';
import process from 'node:process';
import { promisify } from 'node:util';

import { isEnoent } from '../lib/type-guards.ts';
import { parseRemoteToOwnerRepo } from './parse-remote-url.ts';

const execFileAsync = promisify(execFile);

/**
 * Resolves the `owner/repo` of the git remote at `cwd`, best-effort. Prefers the `origin` remote and falls back to the
 * first listed remote when `origin` is absent, then parses the resulting URL to its `owner/repo`. Any failure (no
 * remote, unparseable URL) returns `undefined` so a caller is never blocked on an unresolvable repo.
 */
export async function resolveRepo(cwd: string): Promise<string | undefined> {
  const url = await resolveRemoteUrl(cwd);
  if (url === undefined) {
    return undefined;
  }
  return parseRemoteToOwnerRepo(url) ?? undefined;
}

// region | Helpers

/**
 * Reads the preferred remote's fetch URL via `git remote`, preferring `origin` and falling back to the first listed
 * remote. Returns `undefined` for the expected best-effort cases (no remote, unparseable URL, non-git directory). When
 * the `git` binary itself is unavailable (`ENOENT`), it emits a one-line warning before returning `undefined`, so a
 * broken environment is distinguished from an absent remote rather than silently suppressed.
 */
async function resolveRemoteUrl(cwd: string): Promise<string | undefined> {
  try {
    const { stdout: remotes } = await execFileAsync('git', ['-C', cwd, 'remote']);
    const [first, ...rest] = remotes
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    if (first === undefined) {
      return undefined;
    }
    const preferred = [first, ...rest].includes('origin') ? 'origin' : first;
    const { stdout: url } = await execFileAsync('git', ['-C', cwd, 'remote', 'get-url', preferred]);
    const trimmed = url.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch (error) {
    if (isEnoent(error)) {
      process.stderr.write('resolve-repo: warning: git is not available; the repo cannot be resolved\n');
    }
    return undefined;
  }
}

// endregion | Helpers
