---
name: add-change-record
description: Add a change-record block to a pull request whose body contains none
user-invocable: true
dependencies:
  skills:
    - emit-event
---

# Add change record

Append a `change-record` block to a pull request whose body has none, so that the merge publishes the change entries as `Change:` trailers.

The block is drafted by `{skill:summarize-change}`, which consolidates the branch, draws the entries, audits them, and renders the block. This skill lifts the rendered block from the summary that the run saved and appends it to the pull-request body; it drafts nothing of its own.

**A block that is already written is never replaced.** A readable block, a malformed one, and one that records no entry are all left for the author to repair by hand, as [the change record](../_data/change-record.md#where-the-record-is-read) states. This skill adds a block only where there is none.

## Arguments

| Flag              | Effect                                                                                                                 | Default                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `--pr {n}`        | Add the block to PR `{n}` instead of the PR for the current branch.                                                    | PR for the current branch |
| `--scope {scope}` | Passed to `{skill:summarize-change}`, which records it as an override on the consolidated record.                      | none                      |
| `--type {type}`   | Passed to `{skill:summarize-change}`. A `!` on it (`feat!`) adds the breaking mark, as that skill's own argument does. | none                      |

## Process

### 1. Get session context

Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `branch_name`, `default_branch`, `scm`, and `pr_url` from it. Then emit `skill.started` (payload `{"skill":"add-change-record"}`) per [Lifecycle events](#lifecycle-events).

### 2. Resolve the pull request

Resolve it per [PR source resolution](../_data/pr-source-resolution.md#runtime-resolution-path-review-pr-merge-pr): An explicit `--pr {n}` overrides; otherwise a stored `pr_url` from session context is the default; otherwise discover the pull request for the current branch. Persist the resolved URL via `--set-pr-url`, and invalidate (`--clear-pr-url`) and re-resolve a stored URL that does not yield the expected pull request.

Read the pull request's metadata, dispatching on `scm`:

- **`"github"`**:

  ```bash
  gh pr view {pr} --json number,title,body,headRefName,headRefOid,url
  ```

- **`"bitbucket"`**: Issue an `action: "get"` call per [Bitbucket pull-request access](../_data/bitbucket-pr-access.md), then map its fields onto the same names: `description` to `body`, `source.branch.name` to `headRefName`, `source.commit.hash` to `headRefOid`, and `links.html.href` to `url`.
- **Unknown or missing**: Ask the user which platform to use.

If no pull request can be resolved, emit `skill.completed` (payload `{"outcome":"stopped: no PR"}`) per [Lifecycle events](#lifecycle-events), then stop with: "No open pull request found for branch `{branch_name}`. Create one with `{skill?:create-pr}` first."

### 3. Confirm that HEAD is the pull request's head commit

```bash
git rev-parse HEAD
```

The next step runs `{skill:summarize-change}`, which reads `{default_branch}...HEAD` and records HEAD as the block's `entries_commit`. A block drafted anywhere else describes commits that the pull request does not carry, and `resolve-merge` would read it as stale at merge.

Compare the local SHA with `headRefOid`. On GitHub the two are full SHAs and must be equal; on Bitbucket, compare on a prefix per [Bitbucket pull-request access](../_data/bitbucket-pr-access.md#reading-a-pull-request), since the platform may abbreviate its hash.

When they differ, emit `skill.completed` (payload `{"outcome":"stopped: HEAD is not the PR head"}`) per [Lifecycle events](#lifecycle-events), then stop, naming both commits and the branch to check out.

### 4. Confirm that the body contains no block

Write the pull-request body to a scratch file per [gh body file](#gh-body-file), naming it `gh-body-pr{number}-{timestamp}.md`. On GitHub, write it from the platform, so that the file contains the body byte for byte:

```bash
gh pr view {pr} --json body --jq '.body' > "{body_file}"
```

On Bitbucket, write the `description` from step 2 to the file verbatim.

Then resolve the merge over it, opening with the assignment and the guard:

```bash
body_path="{absolute path from the write step}"
[ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
node {harness_home_dir}/scripts/describe-change.mjs resolve-merge \
  --base "{default_branch}" \
  --head "{headRefOid}" \
  --pr-number "{number}" \
  --pr-title "{title}" \
  --pr-body-file "$body_path"
```

The guard keeps a failed read out of the decision: An empty file contains no block, and this skill would append one to a body that it never read.

Read `notices` from the output. The block reading is settled by the helper rather than by a fence scan here, so that this skill and the merge agree on what counts as a block, malformed included.

Continue only when `notices` contains `absent-block`. Otherwise emit `skill.completed` (payload `{"outcome":"stopped: block present"}`) per [Lifecycle events](#lifecycle-events) and stop with the reason that the notices give:

- **`malformed-block`**: The body's block cannot be read (its `defect`). Say that a written block is never replaced, and that the author repairs this one by hand.
- **Neither notice**: The body already carries a readable block. Say so, and that a block without entries is left as it is.

A guard refusal or a non-zero exit stops the skill the same way, with the helper's own message and the outcome `stopped: block not resolved`.

### 5. Draft the block

Invoke `{skill:summarize-change}`, passing through `--scope` and `--type` as given. That skill saves a change summary whose body ends with the rendered `change-record` block.

Take the last `change-record` fence from the summary that this session just saved, copied character for character, the fence lines included. Read it from the saved file rather than from the transcript.

When the saved summary carries no fence, emit `skill.completed` (payload `{"outcome":"stopped: no block drafted"}`) per [Lifecycle events](#lifecycle-events) and stop, relaying what `{skill:summarize-change}` reported about `render-block`. Nothing is written to the pull request.

### 6. Show the block and ask

Show the block as it will be appended. Emit `input.requested` (payload `{"prompt":"append-block"}`) per [Lifecycle events](#lifecycle-events), then ask:

```
Append this change record to PR #{number}? 👍🏼👎🏼
```

The ask comes after the block is shown, because the write changes state that others read. If the user declines, emit `skill.completed` (payload `{"outcome":"stopped: declined"}`) per [Lifecycle events](#lifecycle-events) and stop with nothing written.

### 7. Write the body back

Append the block after the body read in step 4, separated by one blank line, and write the whole body to a scratch file per [gh body file](#gh-body-file). The block is appended rather than inserted above a `Closes` line: A hand-written body places that line anywhere, and the block's being the body's last element is the only rule that a reader enforces.

- **`"github"`**:

  ```bash
  body_path="{absolute path from the write step}"
  [ -s "$body_path" ] || { echo "Body file missing or empty: $body_path" >&2; exit 1; }
  gh pr edit {number} --body-file "$body_path"
  ```

- **`"bitbucket"`**: The `bitbucketPullRequest` tool exposes no action that updates a pull request's description among the actions that [Bitbucket pull-request access](../_data/bitbucket-pr-access.md) documents. Emit `skill.completed` (payload `{"outcome":"stopped: no Bitbucket write path"}`) per [Lifecycle events](#lifecycle-events), then stop, showing the block again and saying that the author pastes it as the last element of the description in the Bitbucket UI.

### 8. Confirm the block is the body's last element

Re-read the body from the platform as step 4 does, write it to a fresh scratch file, and run `resolve-merge` over it again with the same flags. The block is in place when `notices` no longer contains `absent-block` and no `malformed-block` appears.

When either check fails, say what the helper reported and that the pull request's body is the one to inspect. Do not write again.

### 9. Report

Report the pull-request URL and the path of the change summary that step 5 saved, which is a byproduct of the run rather than a second artifact to compose. Then emit `skill.completed` (payload `{"outcome":"block-added"}`) per [Lifecycle events](#lifecycle-events).

<!-- include: ../_partials/gh-body-file.md / -->

<!-- include: ../_partials/lifecycle-events.md / -->

<!-- include: ../_partials/action-items.md / -->
