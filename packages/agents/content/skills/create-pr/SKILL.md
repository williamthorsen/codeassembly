---
name: create-pr
description: Create a pull request by orchestrating change summary, prefix resolution, label resolution, and platform delegation
user-invocable: true
---

# Create pull request

Create a pull request on the appropriate platform. This is the user-facing entry point that orchestrates the full PR creation flow, delegating platform-specific API calls to internal skills (`create-gh-pr`, `create-bitbucket-pr`).

## Optional arguments

- `--scope {scope}`: Override the scope inferred by `summarize-change`.
- `--type {type}`: Override the work type inferred by `summarize-change`.

## Process

### 1. Get session context

Use `get-session-context` to obtain `ticket_id`, `project_slug`, `platform`, `default_branch`, `branch_name`, and `artifact_base_dir`.

### 2. Check branch sync

Verify the current branch is up to date with remote:

```bash
git fetch origin
git status
```

If the branch is not up to date with remote, **STOP THIS TASK** and notify the user. Do not proceed to `summarize-change` or any later step.

### 3. Call `summarize-change`

Invoke the `summarize-change` skill to produce a change summary. This generates a markdown file with YAML frontmatter containing `title`, `ticket_id`, `commit`, `scope`, and `type`.

### 4. Read frontmatter

Read the YAML frontmatter from the change summary. Extract `title`, `scope`, and `type`.

### 5. Apply overrides

If `--scope` was provided, use it instead of the frontmatter `scope`. If `--type` was provided, use it instead of the frontmatter `type`.

### 6. Resolve PR title prefix

If `type` is present (from frontmatter or override): call `describe-change.sh` to resolve the PR title prefix. Include `--scope` only when `scope` is also present:

```bash
# When both type and scope are present:
json=$({platform_home_dir}/scripts/describe-change.sh --scope {scope} --type {type})

# When only type is present (no scope):
json=$({platform_home_dir}/scripts/describe-change.sh --type {type})
```

```bash
pr_prefix=$(echo "$json" | grep -o '"pr_prefix":"[^"]*"' | cut -d'"' -f4)
```

If `pr_prefix` is non-empty, prepend it to the title: `{pr_prefix}{title}`.

If `type` is absent, use the bare title as-is. Do not call `describe-change.sh` without a type.

See [commit-format.md](../_data/commit-format.md) for prefix conventions.

### 7. Resolve labels

If at least one of `scope` or `type` is present and `.meta/label-map.json` exists, resolve labels following the same pattern as `create-ticket`:

1. Read `.meta/label-map.json` using the Read tool. If the file does not exist, skip — labels = [].
2. **Type label:** Strip any trailing `!` from the type. Look up the stripped type in `label_map.types`. If found, add the mapped label name.
3. **Breaking label:** If the original type had a `!` suffix, add `breaking` as an additional label.
4. **Scope label:** Look up the scope in `label_map.scopes`. If found, add the mapped label name.

Missing entries are silently skipped. If scope or type is absent, skip the corresponding lookup. If neither is present, labels = [].

### 8. Detect platform and select delegate

Read `platform` from the session context manifest:

- `"github"` -> delegate to `create-gh-pr`
- `"bitbucket"` -> delegate to `create-bitbucket-pr`
- Unknown or missing -> ask the user which platform to use

### 9. Call delegate

Pass the following inputs to the selected delegate per the delegate interface:

| Input               | Value                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `title`             | Final title (with prefix if resolved)                                                               |
| `body`              | Content from `## What` onward in the change summary                                                 |
| `labels`            | Resolved label names (may be empty list)                                                            |
| `base_branch`       | Bare branch name derived from `default_branch` (strip remote prefix, e.g., `origin/main` -> `main`) |
| `ticket_id`         | From session context                                                                                |
| `project_slug`      | From session context                                                                                |
| `artifact_base_dir` | From session context                                                                                |

## Important

- The orchestrator owns all decisions (scope, type, prefix, labels). Delegates own only execution (platform API calls).
- Strip the remote prefix from `default_branch` (e.g., `origin/main` -> `main`) before passing to the delegate.
- Never list automated checks (formatting, linting, typechecking, unit tests) in a test plan. They run automatically in CI.
