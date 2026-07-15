---
name: create-pr
description: Create a pull request by orchestrating change summary, title rendering, label resolution, and platform delegation
user-invocable: true
dependencies:
  skills:
    - emit-event
---

# Create pull request

Create a pull request on the appropriate platform. This is the user-facing entry point that orchestrates the full PR creation flow, delegating platform-specific API calls to internal skills (`create-gh-pr`, `create-bitbucket-pr`).

## Optional arguments

- `--scope {scope}`: Override the scope inferred by `summarize-change`.
- `--type {type}`: Override the work type inferred by `summarize-change`.

## Process

### 1. Get session context

Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `ticket_id`, `ticket_ref`, `project_slug`, `scm`, `default_branch`, `branch_name`, and `artifact_base_dir` from it. Then emit `skill.started` (payload `{"skill":"create-pr"}`) per [Lifecycle events](#lifecycle-events).

### 2. Check branch sync

Verify the current branch is up to date with remote:

```bash
git fetch origin
git status
```

If the branch is not up to date with remote, emit `skill.completed` (payload `{"outcome":"stopped: branch not in sync"}`) per [Lifecycle events](#lifecycle-events), then **STOP THIS TASK** and notify the user. Do not proceed to `summarize-change` or any later step. Otherwise, emit `skill.progress` (payload `{"step":"branch-sync-verified"}`) and continue.

### 3. Call `summarize-change`

Invoke the `{skill:summarize-change}` skill to produce a change summary. This generates a markdown file with YAML frontmatter containing `title`, `ticket_id`, `commit`, `scope`, and `type`. Once it returns, emit `skill.progress` (payload `{"step":"change-summary-ready"}`) per [Lifecycle events](#lifecycle-events).

### 4. Read frontmatter

Read the YAML frontmatter from the change summary. Extract `title`, `scope`, and `type`.

### 5. Apply overrides

If `--scope` was provided, use it instead of the frontmatter `scope`. If `--type` was provided, use it instead of the frontmatter `type`.

### 6. Render PR title

Call `describe-change.sh` to render the PR title from the configured `pr.title_format` template. Pass every input that is available — the template controls which tokens are required:

```bash
json=$({harness_home_dir}/scripts/describe-change.sh \
  --title "{title}" \
  --scope "{scope}" \
  --type "{type}" \
  --ticket-ref "{ticket_ref}")
```

Omit any flag whose value is empty or null (e.g., omit `--ticket-ref` when `ticket_ref` from session context is `null`). Quote `--title` so titles with spaces and shell-special characters are preserved.

```bash
pr_title=$(printf '%s' "$json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pr_title',''))")
```

Use a JSON parser (python3 above; `jq -r '.pr_title'` if `jq` is available) instead of `grep`/`cut` because rendered titles may contain backslash-escaped double quotes (`\"`), which a regex extractor would silently truncate.

Use `pr_title` directly as the final PR title. Do not concatenate with `title` separately — the rendered output already includes it.

If the script is not found, fall back to the bare `title` from the change summary.

See [title-templates.md](../_data/title-templates.md) for the title-format model and supported tokens.

### 7. Resolve labels

Resolve labels following the same pattern as `create-ticket`:

1. Read `.meta/label-map.json` using the Read tool. If the file does not exist, skip — labels = [].
2. **Type label** (if `type` is present): Strip any trailing `!` from the type. Look up the stripped type in `label_map.types`. If found, add the mapped label name.
3. **Breaking label** (if `type` is present): If the original type had a `!` suffix, add `breaking` as an additional label.
4. **Scope label** (if `scope` is present): Look up the scope in `label_map.scopes`. If found, add the mapped label name.

Missing entries are silently skipped. If neither scope nor type is present, labels = [].

### 8. Detect platform and select delegate

Read `scm` from the session context manifest:

- `"github"` -> delegate to `{skill:create-gh-pr}`
- `"bitbucket"` -> delegate to `{skill:create-bitbucket-pr}`
- Unknown or missing -> ask the user which platform to use. On this branch only, emit `input.requested` (payload `{"prompt":"platform"}`) per [Lifecycle events](#lifecycle-events) before asking, and emit `input.received` (payload `{"prompt":"platform"}`) on the turn where the user answers.

### 9. Append auto-close keyword (if applicable)

If `ticket_ref` is non-null, append `\n\nCloses {ticket_ref}` to the body. The `Closes` keyword auto-closes the linked ticket when the PR merges (GitHub for numeric same-repo refs; Jira/Linear for prefixed IDs when their respective integrations are configured). Even when no auto-close integration is wired up, the line documents the linkage and gives reviewers a clickable cross-reference.

If `ticket_ref` is null, skip — no closing line.

### 10. Call delegate

Pass the following inputs to the selected delegate per the delegate interface:

| Input               | Value                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `title`             | Rendered `pr_title` from step 6 (or bare `title` if the script was unavailable)                     |
| `body`              | Content from `## What` onward in the change summary                                                 |
| `labels`            | Resolved label names (may be empty list)                                                            |
| `base_branch`       | Bare branch name derived from `default_branch` (strip remote prefix, e.g., `origin/main` -> `main`) |
| `ticket_id`         | From session context                                                                                |
| `project_slug`      | From session context                                                                                |
| `artifact_base_dir` | From session context                                                                                |

### 11. Backfill the PR URL into the change summary and persist it

The delegate reports the created PR's URL (its `PR created: {URL}` line). Stamp it into the change summary from step 3 so the artifact carries a backlink to its PR: insert a `pr: {URL}` line into the change summary's YAML frontmatter, immediately after the `commit:` line. Skip the insertion when a `pr:` line is already present, so a re-run never duplicates it. PR URLs need no quoting in YAML.

Also persist the URL into the branch manifest so PR-aware skills reuse it on later sessions (see [PR source resolution](../_data/pr-source-resolution.md#stored-pr-url)):

```bash
node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs --set-pr-url "{URL}"
```

Then emit `pr.created` (payload `{"number":<n>,"url":"<url>"}`, taking `<n>` from the created PR's number and `<url>` from its URL) per [Lifecycle events](#lifecycle-events), followed by `skill.completed` (payload `{"outcome":"pr-created"}`).

## Important

- The orchestrator owns all decisions (scope, type, title rendering, labels). Delegates own only execution (platform API calls).
- Strip the remote prefix from `default_branch` (e.g., `origin/main` -> `main`) before passing to the delegate.
- Never list automated checks (formatting, linting, typechecking, unit tests) in a test plan. They run automatically in CI.

<!-- include: ../_partials/lifecycle-events.md / -->
