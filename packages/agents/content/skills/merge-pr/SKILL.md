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

| Flag              | Effect                                                       | Default                         |
| ----------------- | ------------------------------------------------------------ | ------------------------------- |
| `--pr {n}`        | Merge PR `{n}` instead of the PR for the current branch.     | PR for the current branch       |
| `--scope {scope}` | Override the inferred scope.                                 | inferred (see resolution below) |
| `--type {type}`   | Override the inferred work type.                             | inferred (see resolution below) |
| `--strategy {s}`  | Override the merge strategy: `squash`, `merge`, or `rebase`. | `squash`                        |
| `--delete {v}`    | Override branch deletion: `both`, `remote`, or `none`.       | `remote`                        |

## Reserved preference keys

`merge.strategy` and `merge.deletion_strategy` are **reserved keys** in `.agents/preferences.yaml` and `~/.agents/preferences.yaml`. They are not yet honored — this iteration uses the hard-coded defaults above. Setting them in preferences has no effect; CLI overrides are the only way to change the values today. The keys are reserved so that adding preference-file lookup later is a localized, additive change that does not require renaming or re-shaping the configuration surface.

## Process

### 1. Get session context

Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `ticket_ref`, `branch_name`, `default_branch`, `scm`, `project_slug`, `ticket_id`, `artifact_base_dir`, and `pr_url` from it. Then emit `skill.started` (payload `{"skill":"merge-pr"}`) per [Lifecycle events](#lifecycle-events).

### 2. Resolve the PR

Resolve the PR to merge per [PR source resolution](../_data/pr-source-resolution.md#runtime-resolution-path-review-pr-merge-pr): an explicit `--pr {n}` overrides; otherwise a stored `pr_url` from session context is the default; otherwise discover the PR for the current branch. Persist the resolved URL via `--set-pr-url`, and invalidate (`--clear-pr-url`) and re-resolve a stored URL that does not yield the expected PR.

Read the PR's metadata for the steps below:

```bash
gh pr view {pr} --json number,title,body,labels,headRefName,baseRefName,url
```

If no PR can be resolved or discovered, emit `skill.completed` (payload `{"outcome":"stopped: no PR"}`) per [Lifecycle events](#lifecycle-events), then stop with: "No open PR found for branch `{branch_name}`. Create one with `{skill:create-pr}` first."

Capture `title` (PR title), `body` (PR body), `labels` (label objects), `number`, and `headRefName` (head branch) from the response. These feed the steps below.

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

Omit any flag whose value is empty or null. For dimensions whose `status` from step 3 is `ambiguous`, omit the flag too — those are resolved at the gate, and this initial render is provisional.

Use a JSON parser (python3 above; `jq -r '.merge_title'` if `jq` is available) instead of `grep`/`cut` because rendered titles may contain backslash-escaped double quotes.

If the script is not found, fall back to the bare title.

### 6. Compose merge-commit body

Extract from the PR body (already in scope from step 2):

1. Find a `## What` heading (case-insensitive match: `## What`, `## what`, `## WHAT`).
2. Take everything from the line after the heading to the next `## ` heading (or end of body).
3. Trim leading/trailing blank lines from the captured content. The captured content is the merge-commit body candidate.

A captured body is **thin** if it is empty or contains fewer than 30 characters of non-whitespace content. The 30-character threshold is a default heuristic — proceed with a shorter `## What` if it is clearly intentional and self-contained (e.g., "Cosmetic only.", "Reverts #418.").

If the `## What` heading is missing or the captured body is thin, compose fresh content from commit messages and the diff:

```bash
git log {default_branch}..HEAD --format=%B
git diff {default_branch}...HEAD --stat
```

Describe the accomplishment from the reader's standpoint. One short paragraph is usually enough; add a follow-up paragraph only when the change is substantial.

<!-- include: ../../_partials/voice-checklist.md / -->

### 7. Approval gate

If `scope.status` or `type.status` from step 3 is `ambiguous`, ask one question at a time before showing the final commit:

- For each ambiguous dimension, present a numbered list of the dimension's `candidates` array, plus an "other (specify)" option. Ask the user to pick. If the candidates array is empty, ask open-ended.
  - When asking option-style questions, follow [option format](#option-format). (Reinforces the rule in `AGENTS.md` — intentional redundancy.)
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

The triangle delimiters wrap the title and body — the parts that will actually be published. Append any additional context (CI status, branch fate, repo-specific commentary) between the closing `▲` and the `{confirmation}` line, outside the delimited region. Everything outside the triangles is metadata for the user's decision.

Render `{confirmation}` so the ask itself names every destructive side effect the approval authorizes. The permission auto-classifier grants only what the ask text names, so a branch deletion shown only in the `Delete:` line above is not authorized — the ask must name it too:

- `none` → `Merge PR #{pr_number}? 👍🏼👎🏼`
- `remote` → `Merge PR #{pr_number} and delete the remote branch {headRefName}? 👍🏼👎🏼`
- `both` → `Merge PR #{pr_number} and delete the local and remote branch {headRefName}? 👍🏼👎🏼`

If the user declines, emit `skill.completed` (payload `{"outcome":"stopped: declined"}`) per [Lifecycle events](#lifecycle-events), then stop with no API call and no artifact. If they approve, continue.

<!-- include: ../_partials/action-items.md / -->

### 8. Detect platform and select delegate

Read `scm` from session context:

- `"github"` → delegate to `{skill:merge-gh-pr}`
- `"bitbucket"` → delegate to `{skill:merge-bb-pr}` (stub; prints the resolved values and exits without merging)
- Unknown or missing → ask the user which platform to use

### 9. Call delegate

Pass the following inputs to the selected delegate per the delegate interface:

| Input               | Value                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| `pr_number`         | Resolved PR number                                                     |
| `title`             | Rendered `merge_title` from step 5 (re-rendered after gate resolution) |
| `body`              | Composed body from step 6                                              |
| `strategy`          | Resolved strategy from step 4                                          |
| `deletion_strategy` | Resolved value from step 4 (`both` \| `remote` \| `none`)              |
| `ticket_id`         | From session context                                                   |
| `project_slug`      | From session context                                                   |
| `artifact_base_dir` | From session context                                                   |

The orchestrator never passes ambiguous-status dimensions or `prompt` sentinels to the delegate — all values are concrete by this point.

If the delegate stopped or failed, emit `skill.completed` (payload `{"outcome":"stopped: <reason>"}`) per [Lifecycle events](#lifecycle-events) and stop. Otherwise capture the merge commit SHA from the delegate's completion report, if it carries one, and continue.

### 10. Record the lede decision

Skip this step when the delegate's completion report carries no merge commit SHA: nothing merged, so there is no shipped lede to decide about. The Bitbucket delegate is the standing case, since it prints the resolved values and exits successfully without merging. Emit `skill.completed` (payload `{"outcome":"not merged"}`) per [Lifecycle events](#lifecycle-events) and stop.

Otherwise the merge has already happened, so this step can only add a record. Declining costs a data point and nothing else, and nothing here can undo or re-run the merge — never present a failure at this step as a merge failure.

Invoke `{skill:capture-lede-decision}` with:

| Input               | Value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| `--artifact-dir`    | `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/` |
| `--pr`              | Resolved PR number                                                 |
| `--merge-commit`    | The merge commit SHA from the delegate's completion report         |
| `--type`, `--scope` | The values resolved in step 3, as settled at the approval gate     |

That skill owns the prompt and the record: it asks once, writes one event on a decision, and writes nothing on a skip. Do not ask again, and do not infer a verdict from whether the ledes differ — a lede that shipped unchanged under time pressure is not an accepted lede.

Then emit `skill.completed` (payload `{"outcome":"merged"}`) per [Lifecycle events](#lifecycle-events).

## Important

- The orchestrator owns all decisions (PR resolution, scope/type/strategy/deletion-strategy resolution, body composition, approval gate). Delegates own only execution (platform API calls + state validation).
- Local state is intentionally untouched after the merge. Branch deletion happens on the remote per the resolved decision; the local working copy and current branch are not modified. A separate skill may handle local cleanup later. The default `remote` mode deletes the remote branch via a post-merge `gh api -X DELETE` call (delegated to `merge-gh-pr`); `both` mode passes `--delete-branch` to `gh pr merge`, which is incompatible with worktree-based workflows — `gh pr merge --delete-branch` fails when the base branch is held by another worktree.
- Never bypass branch protections. The orchestrator does not expose `--admin`; users who need that capability run `gh pr merge --admin` directly.
- Never list automated checks (formatting, linting, typechecking, unit tests) in the merge body. They run automatically in CI.

<!-- include: ../_partials/option-format.md / -->

<!-- include: ../_partials/lifecycle-events.md / -->
