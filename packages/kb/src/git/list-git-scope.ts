import { runGit } from './run-git.ts';

/**
 * Returns every path that git tracks under `root`, plus every untracked path that no ignore rule covers, as an
 * NFC-normalized set of root-relative, slash-separated paths. Returns `undefined` when git cannot list the paths,
 * because `root` is outside a working tree or git cannot be run at all, so a caller keeps its own scope instead of
 * reading an empty set as "git ignores everything".
 *
 * A tracked file stays in scope even when an ignore rule matches it, since every clone still contains it. That is why
 * the function unions the two `ls-files` forms rather than running `git check-ignore`, which would report it ignored.
 *
 * Paths are normalized because git reports NFC but `readdir` reports NFD on macOS, and comparing the two forms
 * unnormalized drops every path whose name contains a combining mark.
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
  for (const stdout of [tracked.stdout, unignored.stdout]) {
    for (const path of stdout.split('\0')) {
      if (path !== '') scope.add(path.normalize('NFC'));
    }
  }
  return scope;
}

// region | Helpers

/** Output cap for one `git ls-files`, sized past the listing produced by a large store. */
const GIT_MAX_BUFFER = 64 * 1_024 * 1_024;

// endregion | Helpers
