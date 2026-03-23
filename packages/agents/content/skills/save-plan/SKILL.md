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
   - Use `get-session-context` to obtain `ticket_id`, `project_slug`, and `artifact_base_dir`
   - Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

3. **Generate slug** from the plan title or description (kebab-case, max 60 chars)

4. **Resolve provenance data**:
   - Run `git rev-parse --short origin/main` via Bash to obtain `{baseSha}`. If the command fails (no remote, shallow clone), omit `baseSha` from the header.
   - Set `{timestamp}` to the current UTC time in ISO 8601 format.

5. **Save** as ticket-level artifact:

   ```
   {YYYYMMDD-HHMMZ}_{slug}_plan.md
   ```

   Example: `20260226-1430Z_oauth2-migration_plan.md`

   `mkdir -p` the target directory before writing.

   Prepend the following YAML frontmatter to the plan content:

   ```yaml
   ---
   provenance:
     skill: plan-mode
     timestamp: <timestamp>
     baseSha: <baseSha>
   ---
   ```

   Include `baseSha` only if resolved successfully.

Follow [artifact conventions](../_data/artifact-conventions.md).

## Completion

Report the file path, then present a ticket prompt and next steps together in a single message. Do not wait for the user's reply before showing next steps.

The plan source is unknown (could be plan mode, third-party tool, or manual) — treat it as unreviewed. Use this as recommendation context when applying the rules in [next-steps-after-plan](../_data/next-steps-after-plan.md). Omit the ticket path from option lines — no ticket path is available at completion time.

```
Plan saved: {plan_path}

Would you like to create or update a ticket for this work? If so, use the `create-ticket` skill.

Next steps:
  ▶ Refine plan (recommended): Use the `refine-plan` skill with plan: {plan_path}
  · Orchestrate: Use the `orchestrate-dev` skill with plan: {plan_path}
  · Implement directly
```
