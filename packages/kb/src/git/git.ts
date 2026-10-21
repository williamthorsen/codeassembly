/** The git adapter for kb: every git invocation that the package makes, with its parsing. */
import { execFileSync } from 'node:child_process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isRecord } from '../type-guards.ts';

/** The outcome of one git query: its parsed value, or git's failure message. */
export type GitAnswer<T> = { ok: true; value: T } | { ok: false; message: string };

/** The git queries that kb makes, each returning parsed values. */
export interface KbGit {
  /** Returns the merge base of `ref` and `HEAD` in the repository containing `cwd`. */
  findMergeBase(input: { cwd: string; ref: string }): GitAnswer<string>;
  /** Returns the root of the working tree containing `cwd`, symlinks resolved. */
  findTopLevel(input: { cwd: string }): GitAnswer<string>;
  /**
   * Lists the files under `cwd` that the working tree adds, modifies, or renames relative to `base`, as paths relative
   * to the working tree's root. A rename is reported at its destination; a deletion is not reported.
   */
  listChangedFiles(input: { cwd: string; base: string }): GitAnswer<string[]>;
  /**
   * Returns every path that git tracks under `root`, plus every untracked path not covered by any ignore rule, as an
   * NFC-normalized set of root-relative, slash-separated paths. Returns `undefined` when git cannot list the paths,
   * because `root` is outside a working tree or git cannot be run at all, so a caller keeps its own scope instead of
   * reading an empty set as "git ignores everything".
   *
   * A tracked file stays in scope even when an ignore rule matches it, since every clone still contains it. That is why
   * the listing unions the two `ls-files` forms rather than running `git check-ignore`, which would report it ignored.
   *
   * Paths are normalized because git reports NFC but `readdir` reports NFD on macOS, and comparing the two forms
   * unnormalized drops every path whose name contains a combining mark.
   */
  listScope(input: { root: string }): ReadonlySet<string> | undefined;
}

/** The adapter that runs git. */
export const realGit: KbGit = {
  findMergeBase,
  findTopLevel,
  listChangedFiles,
  listScope,
};

// region | Helpers

/** Output cap for one `git ls-files`, sized past the listing produced by a large store. */
const GIT_MAX_BUFFER = 64 * 1_024 * 1_024;

/** Extracts git's stderr from a thrown `execFileSync` error, falling back to the error's own message. */
function extractGitErrorMessage(error: unknown): string {
  if (isRecord(error) && typeof error['stderr'] === 'string' && error['stderr'].trim() !== '') {
    return error['stderr'].trim();
  }
  return describeError(error);
}

/** Runs `git merge-base <ref> HEAD`. */
function findMergeBase(input: { cwd: string; ref: string }): GitAnswer<string> {
  return mapAnswer(runGit({ cwd: input.cwd, args: ['merge-base', input.ref, 'HEAD'] }), (stdout) => stdout.trim());
}

/** Runs `git rev-parse --show-toplevel`. */
function findTopLevel(input: { cwd: string }): GitAnswer<string> {
  return mapAnswer(runGit({ cwd: input.cwd, args: ['rev-parse', '--show-toplevel'] }), (stdout) => stdout.trim());
}

/** Runs `git diff` of the working tree against `base`, limited to `cwd`. */
function listChangedFiles(input: { cwd: string; base: string }): GitAnswer<string[]> {
  // `-z` emits NUL-delimited, unquoted paths so that names with non-ASCII bytes survive verbatim (git's default
  // octal-quoting would otherwise corrupt them); `-- .` limits the diff to `cwd` when it is below the repository root.
  const diff = runGit({
    cwd: input.cwd,
    args: ['diff', '--name-only', '-z', '--diff-filter=AMR', '--find-renames', input.base, '--', '.'],
  });
  return mapAnswer(diff, splitNulDelimited);
}

/** Runs both `git ls-files` forms, tracked and untracked-but-not-ignored, and merges their paths. */
function listScope(input: { root: string }): ReadonlySet<string> | undefined {
  const tracked = runGit({ cwd: input.root, args: ['ls-files', '-z'], maxBuffer: GIT_MAX_BUFFER });
  if (!tracked.ok) return undefined;

  const unignored = runGit({
    cwd: input.root,
    args: ['ls-files', '-z', '--others', '--exclude-standard'],
    maxBuffer: GIT_MAX_BUFFER,
  });
  if (!unignored.ok) return undefined;

  const scope = new Set<string>();
  for (const stdout of [tracked.value, unignored.value]) {
    for (const path of splitNulDelimited(stdout)) {
      scope.add(path.normalize('NFC'));
    }
  }
  return scope;
}

/** Applies `parse` to a successful answer's value, passing a failure through. */
function mapAnswer<T>(answer: GitAnswer<string>, parse: (stdout: string) => T): GitAnswer<T> {
  return answer.ok ? { ok: true, value: parse(answer.value) } : answer;
}

/**
 * Runs `git -C cwd <args>` and returns its stdout, or a failure that contains git's own stderr. A git that cannot be
 * spawned fails the same way as one that exits non-zero, so the caller receives both as one kind of failure.
 */
function runGit(input: { cwd: string; args: readonly string[]; maxBuffer?: number }): GitAnswer<string> {
  try {
    const stdout = execFileSync('git', ['-C', input.cwd, ...input.args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(input.maxBuffer !== undefined && { maxBuffer: input.maxBuffer }),
    });
    return { ok: true, value: stdout };
  } catch (error) {
    return { ok: false, message: extractGitErrorMessage(error) };
  }
}

/** Splits NUL-delimited git output into its non-empty entries. */
function splitNulDelimited(stdout: string): string[] {
  return stdout.split('\0').filter((entry) => entry !== '');
}

// endregion | Helpers
