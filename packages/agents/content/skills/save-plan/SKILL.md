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

4. **Resolve provenance and identity data**:
   - Run `git rev-parse --short origin/main` via Bash to obtain `{baseSha}`. If the command fails (no remote, shallow clone), omit `baseSha` from the header.
   - Set `{timestamp}` to the current UTC time in ISO 8601 format.
   - Read `branch_name`, `ticket_id`, and `ticket_ref` from session context (already obtained in step 2). `branch_name` is always present; `ticket_id` and `ticket_ref` are emitted only when non-null.
   - Run `git rev-parse --short HEAD` via Bash to obtain `{commit}`.
   - Resolve `{pr}` via the shared dispatch in [`_data/pr-resolution.md`](../_data/pr-resolution.md). Read `platform` from session context, then run the matching snippet via the Bash tool with `timeout: 5000`:
     - **GitHub:** `gh pr list --head "$BRANCH" --state all --json url --jq '.[0].url // empty'`
     - **Bitbucket:** the `curl` snippet in `pr-resolution.md` against `https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}/pullrequests?q=source.branch.name="{branch}"`, extracting `.values[0].links.html.href`.

     On non-empty output, set `{pr}` to the URL. On empty output, non-zero exit, or timeout, omit the `pr:` line from the frontmatter and emit `Note: PR lookup failed; proceeding without pr field.` in the agent text output.

5. **Save** as ticket-level artifact:

   ```
   {YYYYMMDD-HHMMSSZ}_{slug}_plan.md
   ```

   Example: `20260226-143000Z_oauth2-migration_plan.md`

   `mkdir -p` the target directory before writing.

   Prepend YAML frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema and the [plan provenance](../_data/artifact-conventions.md#plan-provenance) extensions:

   ```yaml
   ---
   provenance:
     skill: plan-mode
     timestamp: <timestamp>
     baseSha: <baseSha>
     isInteractive: true
   ticket_id: <ticket_id>
   ticket_ref: <ticket_ref>
   branch: <branch_name>
   commit: <commit>
   pr: <pr>
   ---
   ```

   Field-emission rules:
   - Include `baseSha` only if resolved successfully.
   - Include `ticket_id` and `ticket_ref` only when non-null in session context.
   - Include `pr` only when the resolution returned a non-empty URL.
   - `branch` and `commit` are always emitted.

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
