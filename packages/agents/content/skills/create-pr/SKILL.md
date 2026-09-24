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

The pull request carries the change's entries, consolidated record, and overrides in the `change-record` block that the change summary's body ends with, as [the change record](../_data/change-record.md) states them.

## Optional arguments

- `--scope {scope}`: Override the scope that `summarize-change` derives.
- `--type {type}`: Override the work type that `summarize-change` derives. A `!` on it (`feat!`) also adds the breaking marker.

Both are passed to `summarize-change`, which records them as overrides beside the consolidated record.

## Process

### 1. Get session context

Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `ticket_id`, `ticket_ref`, `project_slug`, `scm`, `default_branch`, `branch_name`, and `artifact_base_dir` from it. Then emit `skill.started` (payload `{"skill":"create-pr"}`) per [Lifecycle events](#lifecycle-events).

### 2. Check branch sync

Verify the current branch is up to date with remote:

```bash
git fetch origin
git status
```

If the branch is not up to date with remote, emit `skill.completed` (payload `{"outcome":"stopped: branch not in sync"}`) per [Lifecycle events](#lifecycle-events), then **STOP THIS TASK** and notify the user. Do not proceed to `summarize-change` or any later step. Otherwise, continue.

### 3. Call `summarize-change`

Invoke the `{skill:summarize-change}` skill to produce a change summary, passing `--scope` and `--type` when either was provided. The change summary's frontmatter contains the fields that [Change-summary frontmatter](../_data/artifact-conventions.md#change-summary-frontmatter) lists.

### 4. Read frontmatter

Read the YAML frontmatter from the change summary. Extract `title`, the consolidated record's `scope`, `type`, and `breaking`, and the `override_scope`, `override_type`, and `override_breaking` fields. Any of the last six may be absent.

### 5. Resolve the effective record

Resolve the effective record from the frontmatter:

```bash
node {harness_home_dir}/scripts/describe-change.mjs resolve-effective-record \
  --title "{title}" \
  --scope "{scope}" \
  --type "{type}" \
  --breaking \
  --override-scope "{override_scope}" \
  --override-type "{override_type}" \
  --override-breaking
```

Omit each flag whose field is absent from the frontmatter, and pass `--breaking` and `--override-breaking` only if that field is `true`. Read `effective_record` from the output; [`resolve-effective-record`](../_data/title-templates.md#resolve-effective-record) states its fields. Steps 6 and 7 use the effective record, and step 9 records the consolidated record and the overrides apart.

If the call fails, emit `skill.completed` (payload `{"outcome":"stopped: effective record not resolved"}`) per [Lifecycle events](#lifecycle-events), then stop and report its error: The title and the labels both depend on the effective record.

### 6. Render PR title

Call `describe-change.mjs` to render the PR title from the configured `pr.title_format` template. Pass every input that is available, from the effective record; the template controls which tokens are required:

```bash
node {harness_home_dir}/scripts/describe-change.mjs render-titles \
  --title "{title}" \
  --scope "{scope}" \
  --type "{type}" \
  --breaking \
  --ticket-ref "{ticket_ref}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('pr_title',''))"
```

Omit any flag whose value is empty or null (e.g., omit `--ticket-ref` when `ticket_ref` from session context is `null`), and pass `--breaking` only if the effective record is breaking. Quote `--title` so that titles with spaces and shell-special characters are preserved. Render and parse in one Bash invocation, as the pipeline does, and let the parse print: No shell variable survives to a second call, and an assignment prints nothing for the next step to read.

Use a JSON parser (python3 above; `jq -r '.pr_title'` if `jq` is available) instead of `grep`/`cut` because rendered titles may contain backslash-escaped double quotes (`\"`), which a regex extractor would silently truncate.

Read the rendered title from the command's output and use it directly as the final PR title. Do not concatenate with `title` separately; the rendered output already includes it.

If the script is not found, fall back to the bare `title` from the change summary.

See [title-templates.md](../_data/title-templates.md) for the title-format model and supported tokens.

### 7. Resolve labels

Resolve the labels from the change summary's entries and from the effective record in step 5:

```bash
node {harness_home_dir}/scripts/describe-change.mjs resolve-labels \
  --body-file "{change_summary_path}" \
  --scope "{scope}" \
  --type "{type}" \
  --breaking
```

Pass the change summary written in step 3 as `--body-file`. Omit `--scope` and `--type` when the effective record's field is `null`, and pass `--breaking` only if the effective record is breaking. Read `labels` from the output; [`resolve-labels`](../_data/title-templates.md#resolve-labels) states what it contains. Relay any warning that the run writes to stderr.

If the call fails, relay its error and continue with labels = [].

### 8. Detect platform and select delegate

Read `scm` from the session context manifest:

- `"github"` -> delegate to `{skill:create-gh-pr}`
- `"bitbucket"` -> delegate to `{skill?:create-bitbucket-pr}`
- Unknown or missing -> ask the user which platform to use. On this branch only, emit `input.requested` (payload `{"prompt":"platform"}`) per [Lifecycle events](#lifecycle-events) before asking.

### 9. Insert the closing line above the record block

The body copied from the change summary already ends with the rendered `change-record` block, which `summarize-change` writes from the change entries. Carry it through unchanged: Render no block here, and never re-render one from the frontmatter, which records no entries.

If `ticket_ref` is non-null, insert `Closes {ticket_ref}` above that block, separated from the text before it and from the block by one blank line each. The `Closes` keyword auto-closes the linked ticket when the PR merges (GitHub for numeric same-repo refs; Jira/Linear for prefixed IDs when their respective integrations are configured). Even when no auto-close integration is wired up, the line documents the linkage and gives reviewers a clickable cross-reference.

If `ticket_ref` is null, skip: no closing line.

The closing line goes above the block rather than below it because the block is the body's last element, as [The `change-record` block](../_data/change-record.md#the-change-record-block) states. A merge reads the last `change-record` fence wherever it sits, so the order costs nothing to keep and the convention stays true.

If the change summary's body ends with no block, append the closing line as the body's last line and say that the pull request contains no change record, naming `{skill:add-change-record}` as the skill that adds one. A body reaches this step without one when `summarize-change` reported that `render-block` was unavailable or failed.

### 10. Call delegate

Pass the following inputs to the selected delegate per the delegate interface:

| Input               | Value                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `title`             | Rendered `pr_title` from step 6 (or bare `title` if the script was unavailable)                     |
| `body`              | Content from `## What` onward in the change summary, with the closing line inserted per step 9      |
| `labels`            | Resolved label names (may be empty list)                                                            |
| `base_branch`       | Bare branch name derived from `default_branch` (strip remote prefix, e.g., `origin/main` -> `main`) |
| `ticket_id`         | From session context                                                                                |
| `project_slug`      | From session context                                                                                |
| `artifact_base_dir` | From session context                                                                                |

### 11. Persist the PR URL

The delegate reports the created PR's URL (its `PR created: {URL}` line). Persist it into the branch manifest so that PR-aware skills reuse it on later sessions (see [PR source resolution](../_data/pr-source-resolution.md#stored-pr-url)):

```bash
node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs --set-pr-url "{URL}"
```

Then emit `pr.created` (payload `{"number":<n>,"url":"<url>"}`, taking `<n>` from the created PR's number and `<url>` from its URL) per [Lifecycle events](#lifecycle-events), followed by `skill.completed` (payload `{"outcome":"pr-created"}`).

## Important

- The orchestrator makes all decisions (scope, type, title rendering, labels). Delegates only make the platform API calls.
- Strip the remote prefix from `default_branch` (e.g., `origin/main` -> `main`) before passing to the delegate.
- Never list automated checks (formatting, linting, typechecking, unit tests) in a test plan. They run automatically in CI.

<!-- include: ../_partials/lifecycle-events.md / -->
