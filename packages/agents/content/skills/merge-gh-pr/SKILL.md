---
name: merge-gh-pr
description: Merge a GitHub pull request using the delegate interface from merge-pr
user-invocable: false
---

# Merge GitHub pull request

Internal delegate that merges a pull request on GitHub. Called by `merge-pr` with fully-resolved inputs — this skill does not resolve scope, type, strategy, or body; it only validates platform state and executes the merge.

## Delegate interface

| Input               | Type                            | Description                                     |
| ------------------- | ------------------------------- | ----------------------------------------------- |
| `pr_number`         | number                          | PR to merge                                     |
| `title`             | string                          | Pre-rendered merge-commit title                 |
| `body`              | string                          | Pre-composed merge-commit body                  |
| `strategy`          | `squash` \| `merge` \| `rebase` | Concrete strategy (no `prompt` sentinel)        |
| `delete_branch`     | boolean                         | Whether to delete the source branch after merge |
| `ticket_id`         | string                          | Ticket ID for artifact path resolution          |
| `project_slug`      | string                          | Project slug for artifact path resolution       |
| `artifact_base_dir` | string                          | Base directory for artifact storage             |

## Process

### 1. Fetch PR state

Use a single `gh pr view` call to fetch every field needed for validation:

```bash
gh pr view {pr_number} --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,headRefName,headRepositoryOwner,baseRefName
```

Parse the JSON with a real parser (`python3 -c "import sys,json; ..."` or `jq`). Do not regex-extract.

### 2. Run pre-merge checks

Refuse the merge with a specific reason on any of the following. Each refusal exits non-zero and prints the reason on stderr:

| Field              | Failure condition                                            | Refusal reason                                                              |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `state`            | not `"OPEN"`                                                 | "PR #{n} is {state} (not OPEN); cannot merge."                              |
| `isDraft`          | `true`                                                       | "PR #{n} is in draft state; mark it ready first."                           |
| `mergeable`        | `"CONFLICTING"`                                              | "PR #{n} has merge conflicts; resolve and retry."                           |
| `mergeStateStatus` | `"BLOCKED"`                                                  | "PR #{n} is blocked (failing required checks or missing required reviews)." |
| `reviewDecision`   | `"CHANGES_REQUESTED"` or `"REVIEW_REQUIRED"` (when required) | "PR #{n} has unresolved review requirements."                               |

**Failure-mode policy:** when a required field is missing or null in the JSON response (older `gh` versions, repository configurations that don't expose the field), **fail closed**: refuse with "Cannot determine merge state for PR #{n} — verify and merge manually." Never proceed when state is inconclusive.

### 3. Verify branch sync

The orchestrator should already have run `git fetch`, but re-verify:

```bash
git fetch origin
git rev-list --left-right --count "origin/{headRefName}...HEAD"
```

If the counts differ from `0\t0`, refuse: "Local branch is out of sync with `origin/{headRefName}` (ahead {a}, behind {b}); push or pull before merging."

Skip the sync check when `headRepositoryOwner` indicates the PR is from a fork — the local branch is unrelated.

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

For `body`, always pass `--body-file "$body_path"` — the body content matters for `squash` (becomes the commit body) and `merge` (becomes the merge-commit body). For `rebase` it is ignored by GitHub but is harmless to include.

For `delete_branch`, append `--delete-branch` iff the boolean is true.

```bash
gh pr merge {pr_number} \
  --squash \
  --subject "{title}" \
  --body-file "$body_path" \
  --delete-branch
```

If `gh pr merge` exits non-zero, surface its stderr to the user and exit non-zero. Do not retry, do not bypass with `--admin`.

### 6. Capture merge result

Fetch the resulting commit SHA after the merge:

```bash
gh pr view {pr_number} --json mergeCommit,url,mergedAt
```

Extract `mergeCommit.oid` (the merge commit SHA), `url` (PR URL), and `mergedAt` (ISO 8601 timestamp).

### 7. Save merge artifact

Save a `merge` artifact in the ticket directory.

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

`mkdir -p` the target directory before writing.

Filename format:

```
{timestamp}_{slug}_merge.md
```

Use `YYYYMMDD-HHMMSSZ` for `{timestamp}` (UTC). Slug is derived from the title (lowercased, non-alphanumerics replaced with `-`, collapsed).

Follow [artifact conventions](../_data/artifact-conventions.md).

Artifact content:

```markdown
# {title}

PR: {url}
Merged at: {mergedAt}
Merge commit: {mergeCommit.oid}
Strategy: {strategy}
Branch: {headRefName} ({deleted | preserved})

## Body

{body as submitted}
```

## Completion

```
Merged: {url}
Commit: {mergeCommit.oid}
Strategy: {strategy}
Branch: {headRefName} ({deleted | preserved})
Artifact saved: {artifact path}
```

Nothing else.
