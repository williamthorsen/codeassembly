---
name: prepare-pr
description: Prepare pull request description from change summary
user-invocable: true
---

# Prepare PR

Create a pull request description from an existing change summary.

## Process

1. **Get ticket ID** using `get-ticket-id`

2. **Get current commit hash**:

```bash
git rev-parse --short HEAD
```

3. **Find matching change summary**: Resolve the ticket directory (`{base_dir}/projects/{project-slug}/tickets/{ticket-id}/` — see path resolution in [Saving](#saving)). Look for `*_change-summary.md`.
   - Verify content contains the current commit hash

4. **If no match found**: Use `summarize-change` first, then continue

5. **Create PR description**:
   - Copy change summary content
   - Save per the [Saving](#saving) section

## Saving

### Path resolution

1. Read `artifacts.base_dir` from `.agents/preferences.yaml`, falling back to `~/.agents/preferences.yaml`, then default `~/.ai`
2. If base_dir is relative, resolve from project root. If absolute, use as-is.
3. Use `get-project-slug` for the project slug.

Follow [artifact conventions](_data/artifact-conventions.md).

Ticket directory: `{base_dir}/projects/{project-slug}/tickets/{ticket-id}/`

Artifact type: `pull-request`. Filename format:

```
{timestamp}_{slug}_pull-request.md
```

Example: `20250121-1530Z_auto-share-exception_pull-request.md`

## Notes

- The PR description file is a copy of the change summary
- This separation allows for PR-specific modifications if needed
- The change summary serves as the source of truth for branch work
- Never list automated checks (formatting, linting, typechecking, unit tests) in a test plan. They run automatically in CI.
