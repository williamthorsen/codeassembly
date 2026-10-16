# Branch currency

A branch whose base is behind the remote's default branch gets designed, planned, or implemented without the changes that the default branch has gained since. Check the branch before such work starts, so that the gap surfaces while it is still cheap to close.

## When to check

Check a branch other than the default branch, before the work starts. Skip the check on the default branch, comparing `branch_name` with `default_branch` stripped of its remote (everything after its first `/`), and on a detached HEAD, which the manifest reports as an empty `branch_name`. Read both values from the session-context manifest, never from git directly, so that the remote and the default branch follow the repository's preferences.

## Invocation

```
node {harness_home_dir}/scripts/check-branch-currency.mjs --base {default_branch} [--path {path}]...
```

Pass one `--path` for each file or directory that the work touches, relative to the repository root, as the calling skill names them. Pass only paths that exist in the tree; a ticket that describes its area in prose does not supply any. The helper fetches the default branch, which is read-only, and prints one JSON object. It exits non-zero on a usage error, or when git fails after the fetch; act on a non-zero exit as on `fetched: false`, with the helper's stderr as the error.

## Acting on the result

**`fetched: false`.** Report in one line that the branch check did not run, with the `error`, and continue. Never report the branch as current. Where the `consult-sandbox-conventions` skill is deployed, consult it before reading the error as a missing credential or an unreachable network.

**`behind: 0`.** Say nothing.

**`behind` above 0, `ahead: 0`, and `clean: true`.** The branch does not have any commits of its own or uncommitted changes, so a fast-forward loses nothing and can be undone. Run `git merge --ff-only {default_branch}` without asking, and report in one line that the branch was fast-forwarded by `behind` commits, followed by the [commit list](#commit-list). When the fast-forward fails, act on the result as in the next case.

**`behind` above 0 otherwise.** Report the gap and the [commit list](#commit-list), and ask how to proceed before the work starts, as a numbered gradient menu:

1. Bring the base in: by rebase onto `{default_branch}`, or by merging `{default_branch}` into the branch when `pushed` is true, because rebasing pushed commits would then need a force-push.
2. Proceed against the current base.

Recommend the first unless none of the gained commits touches the work. When `clean` is false, say that the tree has uncommitted changes, and do not run a git operation that would touch them before the developer answers.

## Commit list

Name each gained commit by its short SHA and subject. When paths were passed, name only the commits whose `touchesWork` is true, and state how many others the default branch gained; when none touches the work, say so. When paths were not passed, name the first 10 commits of `gained`, which is ordered newest first, and state the count of the rest.

The calling skill states what follows the report.
