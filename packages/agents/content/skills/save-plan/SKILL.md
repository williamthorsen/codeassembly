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

4. **Resolve frontmatter fields**:

   The frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema plus the [plan provenance](../_data/artifact-conventions.md#plan-provenance) extensions.

   <!-- include: ../../_partials/frontmatter-via-script.md -->
   - `provenance.skill`: always `plan-mode`.
   - `provenance.isInteractive`: always `true`.
   <!-- /include -->

5. **Save** as ticket-level artifact:

   ```
   {YYYYMMDD-HHMMSSZ}_{slug}_plan.md
   ```

   Example: `20260226-143000Z_oauth2-migration_plan.md`

   `mkdir -p` the target directory before writing.

Follow [artifact conventions](../_data/artifact-conventions.md).

## Completion

Report the file path, then present a ticket prompt and next steps together in a single message. Do not wait for the user's reply before showing next steps.

```
Plan saved: {plan_path}

Would you like to create or update a ticket for this work? If so, use the `create-ticket` skill.
```

<HARD-GATE>
Read [next-steps-after-plan](../_data/next-steps-after-plan.md) and follow its options, output format, and recommendation rules exactly. Do not improvise the options. The plan was developed in conversation with user participation — use this as recommendation context. Omit the ticket path from option lines — no ticket path is available at completion time.
</HARD-GATE>
