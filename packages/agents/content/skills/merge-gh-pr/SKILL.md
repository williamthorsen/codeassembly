---
name: merge-gh-pr
description: Merge a GitHub pull request using the delegate interface from merge-pr
user-invocable: false
---

# Merge GitHub pull request

Internal delegate that merges a pull request on GitHub. Called by `merge-pr` with fully-resolved inputs — this skill does not resolve scope, type, strategy, or body; it only validates platform state and executes the merge.

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
gh pr view {pr_number} --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,headRefName,isCrossRepository,baseRefName,headRepository,headRepositoryOwner
```

Parse the JSON with a real parser (`python3 -c "import sys,json; ..."` or `jq`). Do not regex-extract.

`headRepository` and `headRepositoryOwner` are needed by step 6's remote-deletion API call so that cross-repo PRs (`isCrossRepository == true`) target the correct head repo rather than the base repo.

### 2. Run pre-merge checks

Refuse the merge with a specific reason on any of the following. On each refusal, exit non-zero and print the reason on stderr:

| Field              | Failure condition                                            | Refusal reason                                                              |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `state`            | not `"OPEN"`                                                 | "PR #{n} is {state} (not OPEN); cannot merge."                              |
| `isDraft`          | `true`                                                       | "PR #{n} is in draft state; mark it ready first."                           |
| `mergeable`        | `"CONFLICTING"`                                              | "PR #{n} has merge conflicts; resolve and retry."                           |
| `mergeStateStatus` | `"BLOCKED"`                                                  | "PR #{n} is blocked (failing required checks or missing required reviews)." |
| `reviewDecision`   | `"CHANGES_REQUESTED"` or `"REVIEW_REQUIRED"` (when required) | "PR #{n} has unresolved review requirements."                               |

**Failure-mode policy:** When a required field is missing or null in the JSON response (older `gh` versions, repository configurations that don't expose the field), **fail closed**: Refuse with "Cannot determine merge state for PR #{n} — verify and merge manually." Never proceed when state is inconclusive.

### 3. Verify branch sync

The branch-sync check only makes sense when the **local current branch is the PR's head branch**. Otherwise (the user invoked with `--pr {n}` for a different branch, or the PR is from a fork) the local working copy is unrelated to what's being merged, and the comparison would produce a spurious refusal.

Detect the case before running the check:

```bash
local_branch=$(git rev-parse --abbrev-ref HEAD)
```

Skip the sync check entirely when **either** of these is true:

- `isCrossRepository` is `true` (PR is from a fork — `gh pr view --json isCrossRepository` returns `true` when the head repo differs from the base repo).
- `local_branch` does not equal `headRefName`.

When neither skip condition applies, run the sync check:

```bash
git fetch origin
git rev-list --left-right --count "origin/{headRefName}...HEAD"
```

If the counts differ from `0\t0`, refuse: "Local branch is out of sync with `origin/{headRefName}` (ahead {a}, behind {b}); push or pull before merging."

### 4. Write merge-commit body to scratch file

Write `body` to a scratch file using the [gh body file](../_data/gh-body-file.md) pattern — do not inline the body into the shell command.

```
path: $TMPDIR/gh-body-{timestamp}.md
```

### 5. Build and execute the merge command

Map `strategy` to the corresponding `gh pr merge` flag:

| `strategy` | Flag       |
| ---------- | ---------- |
| `squash`   | `--squash` |
| `merge`    | `--merge`  |
| `rebase`   | `--rebase` |

For `squash`, pass `--subject "{title}"` so the rendered title becomes the merge-commit subject. For `merge` and `rebase`, omit `--subject` — GitHub composes its own subject for those strategies.

For `body`, pass `--body-file "$body_path"` only when `strategy` is `squash` or `merge`. Skip the flag for `rebase` — rebased commits retain their original messages, so the composed merge body has nothing to attach to. Passing `--body-file` to `gh pr merge --rebase` can make `gh` report an error, depending on its version, so omit it defensively.

For `deletion_strategy`, append `--delete-branch` iff the value is `both`. Skip for `remote` and `none` — `remote` is handled by the new post-merge step below; `none` skips deletion entirely.

Example invocation (shown for `strategy=squash`, `deletion_strategy=both` — `--delete-branch` is included **only** when `deletion_strategy == 'both'`):

```bash
gh pr merge {pr_number} \
  --squash \
  --subject "{title}" \
  --body-file "$body_path" \
  --delete-branch  # only when deletion_strategy == 'both'
```

If `gh pr merge` exits non-zero, print its stderr to the user and exit non-zero. Do not retry, do not bypass with `--admin`.

### 6. Delete remote branch (when deletion_strategy is `remote`)

Skip this step entirely when `deletion_strategy` is not `remote` — `both` is handled by step 5's `--delete-branch`, and `none` requests no deletion.

When `deletion_strategy == 'remote'`, resolve the head-repo coordinates and call the GitHub refs API directly. The head repo is the source of the branch — for same-repo PRs it equals the base repo; for cross-repo PRs (`isCrossRepository == true`) it is the contributor's fork. Use `headRepositoryOwner.login` and `headRepository.name` from the step 1 response:

```bash
gh api -X DELETE "repos/{headRepositoryOwner.login}/{headRepository.name}/git/refs/heads/{headRefName}"
```

If the call exits non-zero, print `warning: Failed to delete remote branch '{headRefName}': {stderr}` to stderr but **do not** exit non-zero. The merge itself succeeded, and re-deleting a leftover branch is trivial.

### 7. Capture merge result

Fetch the resulting commit SHA after the merge:

```bash
gh pr view {pr_number} --json mergeCommit,url,mergedAt
```

Extract `mergeCommit.oid` (the merge commit SHA), `url` (PR URL), and `mergedAt` (ISO 8601 timestamp).

### 8. Save merge artifact

Save a `merge` artifact in the ticket directory.

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

`mkdir -p` the target directory before writing.

Filename format:

```
{timestamp}_{slug}_merge.md
```

Use `YYYYMMDD-HHMMSSZ` for `{timestamp}` (UTC). Slug is derived from the title (lowercased, non-alphanumerics replaced with `-`, collapsed).

Follow [artifact conventions](../_data/artifact-conventions.md).

`capture-lede-decision` reads this artifact's `## Body` later to recover the lede that merged, and it is the only record of that text once the pull request is edited. Where the lede is needed and the artifact does not carry it, that skill takes `--merged-lede-file`; the artifact is not edited to supply it.

Artifact content:

```markdown
<!-- include: ../../_partials/seal-marker.md / -->

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
Artifact saved: {artifact path}
```

Local state is intentionally left untouched; removing the merged branch is left to the user. Do not append local-branch cleanup steps or advice. Do not report this state to the user.
