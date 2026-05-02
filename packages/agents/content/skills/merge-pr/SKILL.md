---
name: merge-pr
description: Merge a pull request by composing a merge-commit message, validating PR state, and delegating to the platform's merge API
user-invocable: true
---

# Merge pull request

Merge a pull request on the appropriate platform. Composes the merge-commit title and body using the project's deterministic title formatter and the PR's curated description, then runs an approval gate before delegating the actual merge to a platform-specific skill (`merge-gh-pr` or `merge-bb-pr`).

## Optional arguments

| Flag                  | Effect                                                       | Default                         |
| --------------------- | ------------------------------------------------------------ | ------------------------------- |
| `--pr {n}`            | Merge PR `{n}` instead of the PR for the current branch.     | PR for the current branch       |
| `--scope {scope}`     | Override the inferred scope.                                 | inferred (see resolution below) |
| `--type {type}`       | Override the inferred work type.                             | inferred (see resolution below) |
| `--strategy {s}`      | Override the merge strategy: `squash`, `merge`, or `rebase`. | `squash`                        |
| `--delete-branch {v}` | Override branch deletion: `yes` or `no`.                     | `yes`                           |

## Reserved preference keys

`merge.strategy` and `merge.delete_branch` are **reserved keys** in `.agents/preferences.yaml` and `~/.agents/preferences.yaml`. They are not yet honored — this iteration uses the hard-coded defaults above. Setting them in preferences has no effect; CLI overrides are the only way to change the values today. The keys are reserved so that adding preference-file lookup later is a localized, additive change that does not require renaming or re-shaping the configuration surface.

## Process

### 1. Get session context

Use `get-session-context` to obtain `ticket_ref`, `branch_name`, `default_branch`, `platform`, `project_slug`, `ticket_id`, and `artifact_base_dir`.

### 2. Resolve PR number

If `--pr {n}` was provided, use `{n}` directly.

Otherwise, look up the PR for the current branch:

```bash
gh pr view --json number,title,body,labels,headRefName,baseRefName
```

If `gh pr view` reports no PR for the current branch, stop with: "No open PR found for branch `{branch_name}`. Create one with `/create-pr` first."

Capture `title` (PR title), `body` (PR body), `labels` (label objects), and `number` from the response. These feed the steps below.

### 3. Resolve scope and type

The resolution function for both scope and type follows the same pipeline:

```
resolve(cliOverride, prLabels, branchCommits):
  if cliOverride is provided:
    return cliOverride
  candidates = reverseLookup(prLabels)        # via .meta/label-map.json
  if exactly one candidate: return it
  candidates = commitMajority(branchCommits)
  if exactly one dominant value: return it
  return AMBIGUOUS                            # resolved at approval gate
```

**Reverse-lookup** inverts `.meta/label-map.json`. Read the file with the Read tool; if it does not exist, skip directly to commit-majority.

- For **type**: invert `label_map.types` (e.g., `feature` → `feat`, `dependencies` → `deps`). Match each PR label against the inverted map; collect distinct values. After collection, strip any trailing `!` from a candidate (the breaking-change marker is carried by a separate `breaking` label, not part of the type).
- For **scope**: invert `label_map.scopes` (e.g., `scope:agents` → `agents`). Match each PR label against the inverted map; collect distinct values.

**Commit-majority** examines commits between `default_branch` and `HEAD`:

```bash
git log {default_branch}..HEAD --format=%s
```

Parse each subject line for the conventional `[scope|type: ]` prefix. Tally distinct values for each dimension; pick the dominant value when one accounts for the strict majority. Otherwise return no dominant value.

Strip a leading `{ticket_ref} ` token before matching `[scope|type: ]` — some projects include the ticket reference in their `commit.title_format` (e.g., `'[{ticket_ref} ][{scope}|{type}: ]{title}'`), in which case the scope/type prefix appears after the ticket-ref token rather than at the start of the subject.

If both reverse-lookup and commit-majority leave the dimension unresolved (or yield more than one candidate), mark it `AMBIGUOUS` and resolve at the approval gate.

### 4. Resolve strategy and delete-branch

```
resolveStrategy(cliOverride):     return cliOverride ?? 'squash'
resolveDeleteBranch(cliOverride): return cliOverride ?? true
```

These are intentionally written as named functions with an explicit pipeline so adding preference-file lookup later means inserting one stage. Map `--delete-branch yes` → `true`, `--delete-branch no` → `false`.

### 5. Render merge-commit title

Compute the bare title from the PR title with the `ticket_ref` prefix stripped:

- If PR title starts with `{ticket_ref} `, the bare title is everything after it.
- Otherwise, the bare title is the full PR title.

Render the merge-commit title via `describe-change.sh`:

```bash
json=$({platform_home_dir}/scripts/describe-change.sh \
  --title "{bare_title}" \
  --scope "{scope}" \
  --type "{type}" \
  --ticket-ref "{ticket_ref}" \
  --pr-number "{pr_number}")
merge_title=$(printf '%s' "$json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('merge_title',''))")
```

Omit any flag whose value is empty, null, or `AMBIGUOUS` (the latter is resolved at the gate; this initial render is provisional).

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

Write the composed body in **release-notes voice** (see `summarize-change`'s `## What` guidance: "Adds support for…", "Fixes an issue where…", "Improves…"). Describe the accomplishment from the reader's standpoint, not the edits. One short paragraph is usually enough; add a follow-up paragraph only when the change is substantial.

### 7. Approval gate

If `scope` or `type` is `AMBIGUOUS`, ask one question at a time before showing the final commit:

- For each ambiguous dimension, present a numbered list of candidates collected during resolution (label-derived + commit-majority candidates), plus an "other (specify)" option. Ask the user to pick.
- After the user resolves each ambiguous dimension, re-render the title (step 5) with the now-concrete values.

Then render the proposed merge to the user:

```
Proposed merge for PR #{pr_number}:

  Title:    {merge_title}
  Strategy: {strategy}
  Delete:   {delete_branch ? 'yes' : 'no'}

  Body:
  {body}

Proceed with merge? 👍🏼👎🏼
```

If the user declines, stop with no API call and no artifact. If they approve, continue.

### 8. Detect platform and select delegate

Read `platform` from session context:

- `"github"` → delegate to `merge-gh-pr`
- `"bitbucket"` → delegate to `merge-bb-pr` (stub; prints the resolved values and exits without merging)
- Unknown or missing → ask the user which platform to use

### 9. Call delegate

Pass the following inputs to the selected delegate per the delegate interface:

| Input               | Value                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| `pr_number`         | Resolved PR number                                                     |
| `title`             | Rendered `merge_title` from step 5 (re-rendered after gate resolution) |
| `body`              | Composed body from step 6                                              |
| `strategy`          | Resolved strategy from step 4                                          |
| `delete_branch`     | Resolved boolean from step 4                                           |
| `ticket_id`         | From session context                                                   |
| `project_slug`      | From session context                                                   |
| `artifact_base_dir` | From session context                                                   |

The orchestrator never passes `prompt` or `AMBIGUOUS` to the delegate — sentinels are resolved upstream.

## Important

- The orchestrator owns all decisions (PR resolution, scope/type/strategy/delete-branch resolution, body composition, approval gate). Delegates own only execution (platform API calls + state validation).
- Local state is intentionally untouched after the merge. Branch deletion happens on the remote per the resolved decision; the local working copy and current branch are not modified. A separate skill may handle local cleanup later.
- Never bypass branch protections. The orchestrator does not expose `--admin`; users who need that capability run `gh pr merge --admin` directly.
- Never list automated checks (formatting, linting, typechecking, unit tests) in the merge body. They run automatically in CI.
