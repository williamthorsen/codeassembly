import { realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import type { KbGit } from '../../git/git.ts';

/** The outcome of resolving a `--vs` ref to its changed-note paths: the store-relative paths, or a failure message. */
export type ChangedPathsResult = { ok: true; paths: string[] } | { ok: false; message: string };

/**
 * Resolves the notes changed between `ref` and the working tree to store-relative paths.
 *
 * The change set is `git diff` of the working tree against `merge-base(ref, HEAD)` with `--diff-filter=AMR`, so it
 * follows renames (reporting the destination), includes uncommitted edits to tracked files, and excludes deletions.
 * Because git emits toplevel-relative paths and resolves symlinks, the function rebases each path onto the real store
 * root: a no-op when the store is the repository root, correct when it is nested. A git failure (unknown ref, not a
 * repository) returns `{ ok: false }` for the caller to report as a usage error rather than throwing.
 */
export function resolveChangedPaths(input: { storeRoot: string; ref: string; git: KbGit }): ChangedPathsResult {
  const { storeRoot, ref, git } = input;

  const mergeBase = git.findMergeBase({ cwd: storeRoot, ref });
  if (!mergeBase.ok) {
    return { ok: false, message: `could not resolve ref "${ref}": ${mergeBase.message}` };
  }

  const toplevel = git.findTopLevel({ cwd: storeRoot });
  if (!toplevel.ok) {
    return { ok: false, message: toplevel.message };
  }

  const diff = git.listChangedFiles({ cwd: storeRoot, base: mergeBase.value });
  if (!diff.ok) {
    return { ok: false, message: diff.message };
  }

  const realStoreRoot = realpathSync(storeRoot);
  const paths = diff.value.map((entry) => relative(realStoreRoot, join(toplevel.value, entry)).split(sep).join('/'));

  return { ok: true, paths };
}
