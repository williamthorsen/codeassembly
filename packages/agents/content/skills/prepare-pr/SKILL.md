---
name: prepare-pr
description: Prepare pull request description from change summary
user-invocable: true
---

# Prepare PR

Create a pull request description from an existing change summary.

## Process

1. **Get context** using `get-session-context` to obtain `ticket_id`, `project_slug`, and `artifact_base_dir`

2. **Get current commit hash**:

```bash
git rev-parse --short HEAD
```

3. **Find matching change summary**: Resolve the ticket directory (`{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`). Look for `*_change-summary.md`.
   - Verify content contains the current commit hash

4. **If no match found**: Use `summarize-change` first, then continue

5. **Create PR description**:
   - Copy change summary content
   - Save per the [Saving](#saving) section

## Saving

### Path resolution

Use `get-session-context` to obtain `artifact_base_dir`, `project_slug`, and `ticket_id`.

Follow [artifact conventions](../_data/artifact-conventions.md).

Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

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
