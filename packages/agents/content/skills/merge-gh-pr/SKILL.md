---
name: merge-gh-pr
description: Merge a GitHub pull request using the delegate interface from merge-pr
user-invocable: false
---

# Merge GitHub pull request

Internal delegate that merges a pull request on GitHub. Called by `merge-pr` with fully-resolved inputs: This skill does not resolve scope, type, strategy, or body; it only validates platform state and executes the merge.

## Delegate interface

| Input               | Type                            | Description                               |
| ------------------- | ------------------------------- | ----------------------------------------- |
| `pr_number`         | number                          | PR to merge                               |
| `title`             | string                          | Pre-rendered merge-commit title           |
| `body`              | string                          | Pre-composed merge-commit body            |
| `strategy`          | `squash` \| `merge` \| `rebase` | Concrete strategy (no `prompt` sentinel)  |
| `deletion_strategy` | `both` \| `remote` \| `none`    | Which branches to delete after merge      |
| `ticket_id`         | string                          | Ticket ID for artifact path resolution    |
| `project_slug`      | string                          | Project slug for artifact path resolution |
| `artifact_base_dir` | string                          | Base directory for artifact storage       |

## Process

### 1. Fetch PR state

Use a single `gh pr view` call to fetch every field needed for validation:

```bash
gh pr view {pr_number} --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,headRefName,isCrossRepository,baseRefName
```

Parse the JSON with a real parser (`python3 -c "import sys,json; ..."` or `jq`). Do not regex-extract.

### 2. Run pre-merge checks

Refuse the merge with a specific reason on any of the following. On each refusal, exit non-zero and print the reason on stderr:

| Field              | Failure condition                                            | Refusal reason                                                              |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `state`            | not `"OPEN"`                                                 | "PR #{n} is {state} (not OPEN); cannot merge."                              |
| `isDraft`          | `true`                                                       | "PR #{n} is in draft state; mark it ready first."                           |
| `mergeable`        | `"CONFLICTING"`                                              | "PR #{n} has merge conflicts; resolve and retry."                           |
| `mergeStateStatus` | `"BLOCKED"`                                                  | "PR #{n} is blocked (failing required checks or missing required reviews)." |
| `reviewDecision`   | `"CHANGES_REQUESTED"` or `"REVIEW_REQUIRED"` (when required) | "PR #{n} has unresolved review requirements."                               |

**Failure-mode policy:** When a required field is missing or null in the JSON response (older `gh` versions, repository configurations that don't expose the field), **fail closed**: Refuse with "Cannot determine merge state for PR #{n}; verify and merge manually." Never proceed when state is inconclusive.

### 3. Verify branch sync

The branch-sync check only makes sense when the **local current branch is the PR's head branch**. Otherwise (the user invoked with `--pr {n}` for a different branch, or the PR is from a fork) the local working copy is unrelated to what's being merged, and the comparison would produce a spurious refusal.

Detect the case before running the check:

```bash
git rev-parse --abbrev-ref HEAD
```

Skip the sync check entirely when **either** of these is true:

- `isCrossRepository` is `true` (PR is from a fork: `gh pr view --json isCrossRepository` returns `true` when the head repo differs from the base repo).
- The printed branch does not equal `headRefName`.

When neither skip condition applies, run the sync check:

```bash
git fetch origin
git rev-list --left-right --count "origin/{headRefName}...HEAD"
```

If the counts differ from `0\t0`, refuse: "Local branch is out of sync with `origin/{headRefName}` (ahead {a}, behind {b}); push or pull before merging."

### 4. Write the title and body to scratch files

Write `body` to a scratch file per [gh body file](#gh-body-file), naming it for the PR (`gh-body-pr{pr_number}-{timestamp}.md`). When `strategy` is `squash`, also write `title` to `gh-title-pr{pr_number}-{timestamp}.txt` in the same directory. Do not inline either into a command.

**Read both files back before step 5.** Read each path that step 5 is about to pass, with the {tool:Read} tool rather than a shell command, and compare its content against the `body` and `title` received by this delegate; a single trailing newline in the title file is ignored. Refuse when either differs, naming the PR and the path: "Body file for PR #{n} at {path} is not the approved merge body." or "Title file for PR #{n} at {path} is not the approved merge title." A squash merge onto a protected default branch publishes a commit message that cannot be amended, so this is the last point at which a wrong message can be caught. Read the paths being passed rather than the ones written earlier in this step, so that a path left over from another PR is caught rather than confirmed.

### 5. Merge and delete the branch

Run the bundled helper as one command. It merges the PR, confirms that the PR is `MERGED`, and deletes the head branch as `deletion_strategy` requests:

```bash
node {harness_home_dir}/skills/merge-gh-pr/merge-gh-pr.mjs --pr {pr_number} --strategy {strategy} --delete {deletion_strategy} --title-file {absolute title path} --body-file {absolute body path}
```

- Pass `--title-file` only when `strategy` is `squash`: GitHub composes its own subject for `merge` and `rebase`.
- Pass `--body-file` only when `strategy` is `squash` or `merge`: Rebased commits keep their own messages, so the composed body has nothing to attach to.
- Pass each path as the literal absolute path, unquoted, without a shell variable or a guard. The helper refuses a missing or empty file itself, and a guard or a shell composition around the command makes the harness ask for permission again.

The helper calls `gh` directly, never through a shell. It passes `--delete-branch` to `gh pr merge` when `deletion_strategy` is `both`. When it is `remote`, the helper deletes the PR's head ref on the head repository, which is the contributor's fork for a cross-repo PR, and only after `gh` reports the PR as `MERGED`.

On success, the helper exits 0 and prints JSON on stdout:

```json
{
  "branchDeletion": "deleted",
  "headRefName": "feature/cache",
  "mergeCommit": { "oid": "abc123" },
  "mergedAt": "2026-09-28T22:00:00Z",
  "url": "https://github.com/acme/widgets/pull/42"
}
```

`branchDeletion` is one of these values:

- `deleted`: The helper deleted the branch.
- `already-deleted`: The branch or its fork was already gone, for example because the repository deletes branches on merge.
- `failed`: A warning on stderr gives the reason. The merge still succeeded, so relay the warning and continue.
- `by-gh`: The deletion strategy was `both`, and `gh pr merge --delete-branch` handled the deletion.
- `not-requested`: The deletion strategy was `none`.

When the helper exits non-zero, print its stderr to the user and stop. This covers a refused input file, a failed `gh pr merge` (whose stderr the helper passes on), and a PR that is not `MERGED` after `gh` accepted the merge, such as a PR placed in a merge queue. Do not retry, and do not bypass with `--admin`.

### 6. Save merge artifact

Save a `merge` artifact in the ticket directory.

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

`mkdir -p` the target directory before writing.

Filename format:

```
{timestamp}_{slug}_merge.md
```

Use `YYYYMMDD-HHMMSSZ` for `{timestamp}` (UTC).

Follow [artifact conventions](../_data/artifact-conventions.md).

When the lede is needed and the artifact does not contain it, `capture-lede-decision` takes `--merged-lede-file`; the artifact is not edited to supply it.

Artifact content:

```markdown
<!-- include: ../../_partials/record-marker.md / -->

# {title}

PR: {url}
Merged at: {mergedAt}
Merge commit: {mergeCommit.oid}
Strategy: {strategy}
Branch: {headRefName}

## Body

{body as submitted, not as the pull request later reads}
```

## Completion

```
Merged: {url}
Commit: {mergeCommit.oid}
Strategy: {strategy}
Branch: {headRefName}
Branch deletion: {branchDeletion}
Artifact saved: {artifact path}
```

Local state is intentionally left untouched; removing the merged branch is left to the user. Do not append local-branch cleanup steps or advice. Do not report this state to the user.

<!-- include: ../_partials/gh-body-file.md / -->
