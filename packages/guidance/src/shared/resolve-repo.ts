/** Best-effort `owner/name` resolution of the git remote at a working directory, shared across skill modules. */
import process from 'node:process';

import { isEnoent } from '../lib/type-guards.ts';
import { realGit, type SharedGit } from './git.ts';
import { parseRemoteToOwnerRepo } from './parse-remote-url.ts';

/**
 * Resolves the `owner/repo` of the git remote at `cwd`, best-effort. Prefers the `origin` remote and falls back to the
 * first listed remote when `origin` is absent, then parses the resulting URL to its `owner/repo`. Returns `undefined`
 * on any failure (a missing remote, an unparseable URL) so that a caller is never blocked on an unresolvable repo.
 */
export async function resolveRepo(cwd: string, git: SharedGit = realGit): Promise<string | undefined> {
  const url = await resolveRemoteUrl(cwd, git);
  if (url === undefined) {
    return undefined;
  }
  return parseRemoteToOwnerRepo(url) ?? undefined;
}

// region | Helpers

/**
 * Reads the preferred remote's fetch URL, preferring `origin` and falling back to the first listed
 * remote. Returns `undefined` for the expected best-effort cases (a missing remote, an unparseable URL, a non-git
 * directory). When the `git` binary itself is unavailable (`ENOENT`), it emits a one-line warning before returning
 * `undefined`, so a broken environment is distinguished from an absent remote rather than silently suppressed.
 */
async function resolveRemoteUrl(cwd: string, git: SharedGit): Promise<string | undefined> {
  try {
    const remotes = await git.listRemotes(cwd);
    const [first] = remotes;
    if (first === undefined) {
      return undefined;
    }
    const preferred = remotes.includes('origin') ? 'origin' : first;
    return await git.findRemoteUrl(cwd, preferred);
  } catch (error) {
    if (isEnoent(error)) {
      process.stderr.write('resolve-repo: warning: git is not available; the repo cannot be resolved\n');
    }
    return undefined;
  }
}

// endregion | Helpers
