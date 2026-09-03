---
name: merge-pr
description: Merge a pull request by composing a merge-commit message, validating PR state, and delegating to the platform's merge API
user-invocable: true
dependencies:
  skills:
    - emit-event
---

# Merge pull request

Merge a pull request on the appropriate platform. Composes the merge-commit title and body using the project's deterministic title formatter and the PR's curated description, then runs an approval gate before delegating the actual merge to a platform-specific skill (`merge-gh-pr` or `merge-bb-pr`).

## Optional arguments

| Flag              | Effect                                                                        | Default                         |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------- |
| `--pr {n}`        | Merge PR `{n}` instead of the PR for the current branch.                      | PR for the current branch       |
| `--scope {scope}` | Override the inferred scope.                                                  | inferred (see resolution below) |
| `--type {type}`   | Override the inferred work type.                                              | inferred (see resolution below) |
| `--strategy {s}`  | Override the merge strategy: `squash`, `merge`, or `rebase`.                  | `squash`                        |
| `--delete {v}`    | Override branch deletion: `both`, `remote`, or `none`. `both` is GitHub-only. | `remote`                        |

## Reserved preference keys

`merge.strategy` and `merge.deletion_strategy` are **reserved keys** in `.agents/preferences.yaml` and `~/.agents/preferences.yaml`. They are not yet honored: This iteration uses the hard-coded defaults above. Setting them in preferences has no effect; CLI overrides are the only way to change the values today. The keys are reserved so that adding preference-file lookup later is a localized, additive change that does not require renaming or re-shaping the configuration surface.

## Process

### 1. Get session context

Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `ticket_ref`, `branch_name`, `default_branch`, `scm`, `project_slug`, `ticket_id`, `artifact_base_dir`, and `pr_url` from it. Then emit `skill.started` (payload `{"skill":"merge-pr"}`) per [Lifecycle events](#lifecycle-events).

### 2. Resolve the PR

Resolve the PR to merge per [PR source resolution](../_data/pr-source-resolution.md#runtime-resolution-path-review-pr-merge-pr): An explicit `--pr {n}` overrides; otherwise a stored `pr_url` from session context is the default; otherwise discover the PR for the current branch. Persist the resolved URL via `--set-pr-url`, and invalidate (`--clear-pr-url`) and re-resolve a stored URL that does not yield the expected PR.

Read the PR's metadata for the steps below, dispatching on `scm`:

- **`"github"`**:

  ```bash
  gh pr view {pr} --json number,title,body,labels,headRefName,baseRefName,url
  ```

- **`"bitbucket"`**: Issue an `action: "get"` call per [Bitbucket pull-request access](../_data/bitbucket-pr-access.md), then map its fields onto the same names the steps below use: `description` to `body`, `source.branch.name` to `headRefName`, `destination.branch.name` to `baseRefName`, `links.html.href` to `url`, and an empty array to `labels`.
- **Unknown or missing**: Ask the user which platform to use, matching step 8's behavior.

If no PR can be resolved or discovered, emit `skill.completed` (payload `{"outcome":"stopped: no PR"}`) per [Lifecycle events](#lifecycle-events), then stop with: "No open PR found for branch `{branch_name}`. Create one with `{skill:create-pr}` first."

Capture `title` (PR title), `body` (PR body), `labels` (label objects), `number`, and `headRefName` (head branch) from the response. The steps below use them.

### 3. Resolve scope and type

Invoke `resolve-merge-options.sh` to resolve both dimensions in one call. The script combines the CLI override, reverse-lookup against `.meta/label-map.json`, and commit-majority over `git log {default_branch}..HEAD --format=%s` per the rules documented in the script header.

```bash
json=$({harness_home_dir}/scripts/resolve-merge-options.sh \
  [--cli-scope "{cli_scope}"] \
  [--cli-type "{cli_type}"] \
  [--pr-label "{label_1}" --pr-label "{label_2}" ...] \
  --base-ref "{default_branch}" \
  [--ticket-ref "{ticket_ref}"])
```

Omit `--cli-scope`/`--cli-type` when no override was provided. Pass each PR label from step 2 as a separate `--pr-label` flag (the repeated form is robust against label names that contain commas). Include `--ticket-ref` when `ticket_ref` is non-null in session context.

A Bitbucket PR contributes no labels, since `create-bitbucket-pr` applies none. The script already treats zero labels as no signal and falls through to commit-majority, so this is a missing signal rather than a failure and needs no special handling here.

The output is a JSON object with one entry per dimension:

```json
{
  "scope": { "status": "resolved", "value": "agents" },
  "type": { "status": "ambiguous", "candidates": ["feat", "fix"] }
}
```

Read `.scope.status` and `.type.status` with python3 (or jq). When `status` is `"resolved"`, use `.value` as the concrete value. When `status` is `"ambiguous"`, carry the `candidates` array forward to the approval gate.

### 4. Resolve strategy and deletion strategy

```
resolveStrategy(cliOverride):          return cliOverride ?? 'squash'
resolveDeletionStrategy(cliOverride):  return cliOverride ?? 'remote'
```

These are intentionally written as named functions with an explicit pipeline so adding preference-file lookup later means inserting one stage. `--delete both|remote|none` map directly to the same string values.

Refuse here when `scm` is `"bitbucket"` and the resolved deletion strategy is `both`, before step 7 asks for anything. Emit `skill.completed` (payload `{"outcome":"stopped: unsupported deletion strategy"}`) per [Lifecycle events](#lifecycle-events), then stop with:

<!-- include: ../_partials/bitbucket-delete-both-refusal.md / -->

`scm` is known from step 1 and the strategy from this step, so the refusal costs nothing here. Deferring it to the delegate would have step 7 ask the user to authorize deleting a local branch the platform cannot touch, and refuse after they answered. `merge-bb-pr` keeps the same guard for a caller that reaches it without this orchestrator.

### 5. Render merge-commit title

Compute the bare title from the PR title with the `ticket_ref` prefix stripped:

- If PR title starts with `{ticket_ref} `, the bare title is everything after it.
- Otherwise, the bare title is the full PR title.

Render the merge-commit title via `describe-change.sh`:

```bash
json=$({harness_home_dir}/scripts/describe-change.sh \
  --title "{bare_title}" \
  --scope "{scope}" \
  --type "{type}" \
  --ticket-ref "{ticket_ref}" \
  --pr-number "{pr_number}")
merge_title=$(printf '%s' "$json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('merge_title',''))")
```

Omit any flag whose value is empty or null. For dimensions whose `status` from step 3 is `ambiguous`, omit the flag too: Those are resolved at the gate, and this initial render is provisional.

Use a JSON parser (python3 above; `jq -r '.merge_title'` if `jq` is available) instead of `grep`/`cut` because rendered titles may contain backslash-escaped double quotes.

If the script is not found, fall back to the bare title.

### 6. Compose merge-commit body

Extract from the PR body (already in scope from step 2):

1. Find a `## What` heading (case-insensitive match: `## What`, `## what`, `## WHAT`).
2. Take everything from the line after the heading to the next `## ` heading (or end of body).
3. Trim leading/trailing blank lines from the captured content. The captured content is the merge-commit body candidate.

A captured body is **thin** if it is empty or contains fewer than 30 characters of non-whitespace content. The 30-character threshold is a default heuristic; proceed with a shorter `## What` if it is clearly intentional and self-contained (e.g., "Cosmetic only.", "Reverts #418.").

If the `## What` heading is missing or the captured body is thin, compose fresh content from commit messages and the diff:

```bash
git log {default_branch}..HEAD --format=%B
git diff {default_branch}...HEAD --stat
```

Report what the change did. The whole body is the lede, so the doctrine below applies to it end to end.

<!-- include: ../../_partials/voice-checklist.md / -->

<!-- include: ../_partials/nested-list-indent.md / -->

### 7. Approval gate

If `scope.status` or `type.status` from step 3 is `ambiguous`, ask one question at a time before showing the final commit:

- For each ambiguous dimension, present a numbered list of the dimension's `candidates` array, plus an "other (specify)" option. Ask the user to pick. If the candidates array is empty, ask open-ended.
  - When asking option-style questions, follow [option format](#option-format). (Reinforces the rule in `AGENTS.md`: intentional redundancy.)
- After the user resolves each ambiguous dimension, re-render the title (step 5) with the now-concrete values.

Emit `input.requested` (payload `{"prompt":"merge-approval"}`) per [Lifecycle events](#lifecycle-events), then render the proposed merge to the user:

```
Proposed merge for PR #{pr_number}:

  Title:    ▶︎ {merge_title} ◀︎
  Strategy: {strategy}
  Delete:   {deletion_strategy}

  ▼ Body
  {body}
  ▲

{confirmation}
```

The triangle delimiters wrap the title and body, the parts that will actually be published. Append any additional context (CI status, branch fate, repo-specific commentary) between the closing `▲` and the `{confirmation}` line, outside the delimited region. Everything outside the triangles is metadata for the user's decision.

Render `{confirmation}` so the ask itself names every destructive side effect the approval authorizes. The permission auto-classifier grants only what the ask text names, so a branch deletion shown only in the `Delete:` line above is not authorized; the ask must name it too:

- `none` → `Merge PR #{pr_number}? 👍🏼👎🏼`
- `remote` → `Merge PR #{pr_number} and delete the remote branch {headRefName}? 👍🏼👎🏼`
- `both` → `Merge PR #{pr_number} and delete the local and remote branch {headRefName}? 👍🏼👎🏼`

If the user declines, emit `skill.completed` (payload `{"outcome":"stopped: declined"}`) per [Lifecycle events](#lifecycle-events), then stop with no API call and no artifact. If they approve, continue.

<!-- include: ../_partials/action-items.md / -->

### 8. Detect platform and select delegate

Read `scm` from session context:

- `"github"` → delegate to `{skill:merge-gh-pr}`
- `"bitbucket"` → delegate to `{skill:merge-bb-pr}`
- Unknown or missing → ask the user which platform to use

### 9. Re-read the PR and re-confirm a changed title or body

This step exists because a published merge-commit title and body cannot be amended on a protected default branch under a squash merge. The approval gate is human-paced, so an edit made to the PR while it is pending would otherwise be discarded and the merge would publish the pre-gate text irrecoverably. Do not fold this read back into step 2: A single pre-gate read is what leaves that window open.

Re-read the PR's `title` and `description` (or `body` on GitHub) using step 2's platform dispatch, then re-derive the two values the merge publishes:

- **Title**: Re-run step 5 over the new PR title, passing the scope and type as settled at the approval gate. Step 5's omit-when-ambiguous rule governs its initial provisional render alone. A re-render that dropped `--scope` or `--type` because step 3's `status` was `ambiguous` would render a title the user never saw and report it as the user's own edit.
- **Body**: Re-run step 6's extraction over the new description and compare the extracted `## What` region against the region extracted for the body the user most recently approved. Where that region is unchanged, carry the approved body forward unchanged. Where it moved, re-run step 6 over it in full, the thin-body fallback included, so a description that has since gained a real `## What` is picked up. The baseline advances with each approval, as the title's does; holding it at the pre-gate region would re-run the fallback on every pass and never converge.

The body comparison keys on the extracted region rather than on the composed body because step 6's thin-body fallback composes fresh prose, which does not reproduce word for word from one run to the next. Comparing composed output would report a change on every pass, and the loop below would have no fixed point to reach. The extraction is deterministic, so it has one. Keying on the region rather than on the whole description also means an edit confined to another section raises nothing, which is correct: Nothing outside `## What` reaches the merge commit.

The window this step closes is an edit to the PR's title or description. New commits pushed to the branch are not in scope, and a generated body is not re-derived on their account; the delegate's own branch-sync check is where local and remote divergence surfaces.

Where both derived values match the approved ones, continue to step 10 without saying anything. Where either differs, re-render step 7's gate with the new values and ask again, and repeat this step after each approval until the values hold steady. Merging the newest version silently would publish text the user never approved, which is the same defect from the other direction. If the user declines, emit `skill.completed` (payload `{"outcome":"stopped: declined"}`) per [Lifecycle events](#lifecycle-events) and stop with no merge and no artifact, exactly as step 7 does.

### 10. Call delegate

Pass the following inputs to the selected delegate per the delegate interface:

| Input               | Value                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| `pr_number`         | Resolved PR number                                                     |
| `title`             | Rendered `merge_title` as step 9 last re-derived and the user approved |
| `body`              | Composed body as step 9 last re-derived and the user approved          |
| `strategy`          | Resolved strategy from step 4                                          |
| `deletion_strategy` | Resolved value from step 4 (`both` \| `remote` \| `none`)              |
| `ticket_id`         | From session context                                                   |
| `project_slug`      | From session context                                                   |
| `artifact_base_dir` | From session context                                                   |

The orchestrator never passes ambiguous-status dimensions or `prompt` sentinels to the delegate: All values are concrete by this point.

If the delegate stopped or failed, emit `skill.completed` (payload `{"outcome":"stopped: <reason>"}`) per [Lifecycle events](#lifecycle-events) and stop. Otherwise capture two things from the delegate's completion report and continue: whether it reported a merge, and the merge commit SHA where it reported one. Step 11 branches on both, and they are not the same signal.

### 11. Record the lede decision

Skip this step when the delegate reported no merge: Nothing shipped, so there is no lede to decide about. Emit `skill.completed` (payload `{"outcome":"not merged"}`) per [Lifecycle events](#lifecycle-events) and stop.

Skip it too, for a different reason, when the delegate reported a merge whose commit SHA is unavailable. `capture-lede-decision` requires `--merge-commit`, so the record cannot be written; the merge still landed. Say so, and emit `skill.completed` (payload `{"outcome":"merged: lede decision skipped, no SHA"}`). Never fold this case into "not merged", which would report a landed merge as one that did not happen.

Otherwise the merge has already happened, so this step can only add a record. Declining costs a data point and nothing else, and nothing here can undo or re-run the merge; never present a failure at this step as a merge failure.

Invoke `{skill:capture-lede-decision}` with:

| Input               | Value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| `--artifact-dir`    | `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/` |
| `--pr`              | Resolved PR number                                                 |
| `--merge-commit`    | The merge commit SHA from the delegate's completion report         |
| `--type`, `--scope` | The values resolved in step 3, as settled at the approval gate     |

That skill owns the prompt and the record: It asks once, writes one event on a rating, and writes nothing on a skip. Do not ask again, and never supply a rating the author did not give: A lede that shipped unchanged under time pressure is not a rated lede.

Then emit `skill.completed` (payload `{"outcome":"merged"}`) per [Lifecycle events](#lifecycle-events).

## Important

- The orchestrator owns all decisions (PR resolution, scope/type/strategy/deletion-strategy resolution, body composition, approval gate). Delegates own only execution (platform API calls + state validation).
- Local state is intentionally untouched after the merge. The delegate deletes the branch on the remote per the resolved decision; the local working copy and current branch are not modified. A separate skill may handle local cleanup later. The default `remote` mode deletes the remote branch via a post-merge `gh api -X DELETE` call (delegated to `merge-gh-pr`); `both` mode passes `--delete-branch` to `gh pr merge`, which is incompatible with worktree-based workflows: `gh pr merge --delete-branch` fails when the base branch is held by another worktree. On Bitbucket, `both` has no counterpart at all and `merge-bb-pr` refuses it, naming `--delete remote` as the alternative.
- Never bypass branch protections. The orchestrator does not expose `--admin`; users who need that capability run `gh pr merge --admin` directly.
- Never list automated checks (formatting, linting, typechecking, unit tests) in the merge body. They run automatically in CI.

<!-- include: ../_partials/option-format.md / -->

<!-- include: ../_partials/lifecycle-events.md / -->
