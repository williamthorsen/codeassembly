---
name: merge-bb-pr
description: Merge a Bitbucket pull request using the delegate interface from merge-pr
user-invocable: false
---

# Merge Bitbucket pull request

Internal delegate that merges a pull request on Bitbucket. Called by `merge-pr` with fully-resolved inputs: This skill does not resolve scope, type, strategy, or body; it only validates platform state and executes the merge.

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

## Bitbucket access

Every Bitbucket call below goes through the tool named in [Bitbucket pull-request access](../_data/bitbucket-pr-access.md). Coordinates come from that document's cascade: the PR URL where `merge-pr` resolved one, and the git remote where it was handed a bare `--pr {n}` instead.

## Process

### 1. Refuse an unmappable deletion strategy

`deletion_strategy: both` has no Bitbucket counterpart. `closeSourceBranch` governs the remote side alone, and nothing in the tool's surface deletes a local branch. Refuse before any other step, so nothing is published:

```
Bitbucket cannot delete a local branch as part of a merge; `--delete both` has no counterpart. Re-run with `--delete remote` and remove the local branch yourself.
```

`remote` and `none` map to `closeSourceBranch` in step 4.

### 2. Fetch and validate PR state

Issue one `action: "get"` call with `prId` set to `pr_number`, per [Reading a pull request](../_data/bitbucket-pr-access.md#reading-a-pull-request). Capture `state`, `source.branch.name`, `source.repository.full_name`, and `links.html.href`.

Refuse the merge when `state` is not `OPEN`, naming the state: "PR #{n} is {state} (not OPEN); cannot merge." The refusal covers `MERGED`, `DECLINED`, and `SUPERSEDED`. When `state` is missing from the response, **fail closed**: Refuse with "Cannot determine merge state for PR #{n}; verify and merge manually."

Bitbucket exposes no counterpart to GitHub's `mergeable` or `mergeStateStatus`, and this step invents none. A conflict, a failing required check, or a missing required approval surfaces as the step 4 merge call's own error, which happens before anything is published.

### 3. Verify branch sync

The check only makes sense when the local working copy holds the branch being merged. Otherwise it is unrelated to what is being merged, and the comparison would produce a spurious refusal.

```bash
local_branch=$(git rev-parse --abbrev-ref HEAD)
```

Skip the check when **either** holds:

- `local_branch` does not equal `source.branch.name`.
- `source.repository.full_name` does not equal the resolved `{workspace}/{repo}` pair, which makes this a fork PR. `origin/{source.branch.name}` then names a branch in the base repository, and a fork PR whose source branch happens to share that name would be compared against an unrelated ref.

Both conditions mirror `merge-gh-pr`'s, whose second keys on `isCrossRepository`. Otherwise:

```bash
git fetch origin
git rev-list --left-right --count "origin/{source.branch.name}...HEAD"
```

If the counts differ from `0\t0`, refuse: "Local branch is out of sync with `origin/{source.branch.name}` (ahead {a}, behind {b}); push or pull before merging."

### 4. Execute the merge

Map `strategy` per [Merging a pull request](../_data/bitbucket-pr-access.md#merging-a-pull-request): `squash` to `squash`, `merge` to `merge_commit`, and `rebase` to `rebase_fast_forward`. Do not pre-check the repository's enabled strategies; the tool exposes no such list, and a disabled strategy surfaces the platform's own error naming it.

Compose `message` as `title`, a blank line, then `body`, for `squash` and `merge_commit`. Omit `message` for `rebase_fast_forward`: Rebased commits keep their own messages, so a composed merge message has nothing to attach to. This mirrors `merge-gh-pr`'s handling of `--rebase`.

Passing a composed title for `merge_commit` diverges from `merge-gh-pr`, which omits `--subject` and lets GitHub compose its own subject. Bitbucket's single `message` field covers title and body together, so there is no way to supply the body and leave the subject to the platform.

Set `closeSourceBranch` to `true` for `deletion_strategy: remote` and `false` for `none`.

Call `action: "merge"` with `prId`, `mergeStrategy`, `message` (except for `rebase_fast_forward`), and `closeSourceBranch`. If the call fails, surface the tool's error and exit non-zero. Do not retry, and do not fall back to another strategy.

### 5. Capture the merge result

Issue a second `action: "get"` call and read `state`, `merge_commit.hash`, `links.html.href`, and `updated_on`. The merge commit hash comes from this read rather than from the merge response, so it does not depend on what that response returns.

`updated_on` after a successful merge is the moment the merge landed, and it stands in for GitHub's `mergedAt`.

Step 4 returning success means the merge landed, so an absent `merge_commit.hash` is an anomaly in this read rather than evidence of no merge. Report it as such: Where `state` is `MERGED` and the hash is absent, say the merge succeeded and the hash is unavailable, and write `unavailable` into the artifact's `Merge commit:` line. Never report an absent hash as a merge that did not happen. `merge-pr` reads a missing SHA in the completion report as "nothing merged" and skips the lede decision on that basis, so a silent omission here would classify a landed merge as no merge at all.

### 6. Save merge artifact

Save a `merge` artifact in the ticket directory, in the same format `merge-gh-pr` writes, so `merge-pr` step 11 reads it on this platform as it does on GitHub.

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

PR: {links.html.href}
Merged at: {updated_on}
Merge commit: {merge_commit.hash}
Strategy: {strategy}
Branch: {source.branch.name}

## Body

{body as submitted, not as the pull request later reads}
```

## Completion

```
Merged: {links.html.href}
Commit: {merge_commit.hash}
Strategy: {strategy}
Branch: {source.branch.name}
Artifact saved: {artifact path}
```

Local state is intentionally left untouched; removing the merged branch is left to the user. Do not append local-branch cleanup steps or advice. Do not report this state to the user.
