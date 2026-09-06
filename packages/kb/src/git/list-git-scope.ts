import { runGit } from './run-git.ts';

/**
 * Returns every path git accounts for under `root` as an NFC-normalized set of root-relative, slash-separated paths:
 * tracked files, plus untracked ones that no ignore rule covers. Returns `undefined` where git holds no opinion,
 * because `root` lies outside a working tree or git cannot be run at all, so a caller keeps its own scope instead of
 * reading an empty set as "git ignores everything".
 *
 * A tracked file stays in scope even where an ignore rule matches it, since every clone still sees it. That is why
 * the scope unions the two `ls-files` forms rather than asking `git check-ignore`, which would report it ignored.
 *
 * Paths are normalized because git reports NFC where `readdir` reports NFD on macOS, and comparing the two forms
 * unnormalized drops every path whose name carries a combining mark.
 */
export function listGitScope(input: { root: string }): ReadonlySet<string> | undefined {
  const tracked = runGit({ cwd: input.root, args: ['ls-files', '-z'], maxBuffer: GIT_MAX_BUFFER });
  if (!tracked.ok) return undefined;

  const unignored = runGit({
    cwd: input.root,
    args: ['ls-files', '-z', '--others', '--exclude-standard'],
    maxBuffer: GIT_MAX_BUFFER,
  });
  if (!unignored.ok) return undefined;

  const scope = new Set<string>();
  for (const path of [...splitRecords(tracked.stdout), ...splitRecords(unignored.stdout)]) {
    scope.add(path.normalize('NFC'));
  }
  return scope;
}

// region | Helpers

/** Output cap for one `git ls-files`, sized past the listing a large store produces. */
const GIT_MAX_BUFFER = 64 * 1_024 * 1_024;

/**
 * The NUL byte separating `git ls-files -z` records. Built rather than written as an escape, because the formatter
 * rewrites an escape into the byte itself, and a literal NUL in a source file makes `grep` treat it as binary.
 */
const NUL = String.fromCodePoint(0);

/** Splits NUL-delimited `git ls-files -z` output into its non-empty records. */
function splitRecords(stdout: string): string[] {
  return stdout.split(NUL).filter((record) => record !== '');
}

// endregion | Helpers
