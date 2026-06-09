import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { isRecord } from '../../type-guards.ts';

/** The outcome of resolving a `--vs` ref to its changed-note paths: the store-relative paths, or a failure message. */
export type ChangedPathsResult = { ok: true; paths: string[] } | { ok: false; message: string };

/**
 * Resolves the notes changed between `ref` and the working tree to store-relative paths.
 *
 * The change set is `git diff` of the working tree against `merge-base(ref, HEAD)` with `--diff-filter=AMR`, so it
 * follows renames (reporting the destination), includes uncommitted edits to tracked files, and excludes deletions.
 * Git emits toplevel-relative paths and resolves symlinks, so each path is rebased onto the real store root — a no-op
 * when the store is the repository root, correct when it is nested. A git failure (unknown ref, not a repository)
 * returns `{ ok: false }` for the caller to surface as a usage error rather than throwing.
 */
export function resolveChangedPaths(input: { storeRoot: string; ref: string }): ChangedPathsResult {
  const { storeRoot, ref } = input;

  const mergeBase = tryGit(storeRoot, ['merge-base', ref, 'HEAD']);
  if (!mergeBase.ok) {
    return { ok: false, message: `could not resolve ref "${ref}": ${mergeBase.message}` };
  }

  const toplevel = tryGit(storeRoot, ['rev-parse', '--show-toplevel']);
  if (!toplevel.ok) {
    return { ok: false, message: toplevel.message };
  }

  // `-z` emits NUL-delimited, unquoted paths so names with non-ASCII bytes survive verbatim (git's default
  // octal-quoting would otherwise corrupt them); `-- .` limits the diff to the store subtree when the store is
  // nested below the repository root.
  const diff = tryGit(storeRoot, [
    'diff',
    '--name-only',
    '-z',
    '--diff-filter=AMR',
    '--find-renames',
    mergeBase.stdout.trim(),
    '--',
    '.',
  ]);
  if (!diff.ok) {
    return { ok: false, message: diff.message };
  }

  const realStoreRoot = realpathSync(storeRoot);
  const repoRoot = toplevel.stdout.trim();
  const paths = diff.stdout
    .split('\0')
    .filter((entry) => entry !== '')
    .map((entry) => relative(realStoreRoot, join(repoRoot, entry)).split(sep).join('/'));

  return { ok: true, paths };
}

// region | Helpers

/** Runs `git -C storeRoot <args>`, returning its stdout or a failure carrying git's stderr. */
function tryGit(
  storeRoot: string,
  args: readonly string[],
): { ok: true; stdout: string } | { ok: false; message: string } {
  try {
    const stdout = execFileSync('git', ['-C', storeRoot, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout };
  } catch (error) {
    return { ok: false, message: gitErrorMessage(error) };
  }
}

/** Extracts git's stderr from a thrown `execFileSync` error, falling back to the error's own message. */
function gitErrorMessage(error: unknown): string {
  if (isRecord(error) && typeof error.stderr === 'string' && error.stderr.trim() !== '') {
    return error.stderr.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

// endregion | Helpers
