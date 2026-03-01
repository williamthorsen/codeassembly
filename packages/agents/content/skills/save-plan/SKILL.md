---
name: save-plan
description: Save plan from conversation context as a ticket-scoped artifact
user-invocable: true
---

# Save plan

Save the plan from the current conversation as a ticket-scoped artifact. Useful after built-in plan mode, `/plan`, or any conversation that produced a plan.

## Process

1. **Extract plan content** from conversation context (the most recent plan discussed or produced)

2. **Resolve artifact path**:
   - Use `get-branch-context` for `ticket_id` and `project_slug`
   - Read `artifacts.base_dir` from `.agents/preferences.yaml`, falling back to `~/.agents/preferences.yaml`, then default `~/.ai`
   - If `base_dir` is relative, resolve from project root. If absolute, use as-is.
   - Ticket directory: `{base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

3. **Generate slug** from the plan title or description (kebab-case, max 60 chars)

4. **Save** as ticket-level artifact:

   ```
   {YYYYMMDD-HHMMZ}_{slug}_plan.md
   ```

   Example: `20260226-1430Z_oauth2-migration_plan.md`

   `mkdir -p` the target directory before writing.

Follow [artifact conventions](_data/artifact-conventions.md).

## Completion

Report the file path. Nothing else.
