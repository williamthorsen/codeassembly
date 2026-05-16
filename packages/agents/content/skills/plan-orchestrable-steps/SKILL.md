---
name: plan-orchestrable-steps
description: Break a story into independently orchestrable steps with interactive refinement
user-invocable: true
---

# Plan

Decompose a story or task into independently orchestrable implementation steps. Each step produces a self-contained task description suitable for `/orchestrate-dev`. The plan is refined interactively through user feedback.

## Arguments

- Story/task description (required): what to decompose into implementation steps

## Visibility

Before every Task call and after every phase completion, output a status line:

- **Before:** `── Planning ── delegating to planner...`
- **After:** `── Planning ── {step count} steps, {question count} questions`

## Flow

### 1. Resolve context

1. Use `get-session-context` to obtain `project_slug`, `ticket_id`, and `artifact_base_dir`.
2. If no ticket ID is available, auto-generate one: `{YYYYMMDD}-{4 random hex}`.
3. **Resolve artifact directory**: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/` -- this is the ticket level, NOT inside a run directory. `orchestration-plan.json` is a ticket-level mutable artifact.
4. `mkdir -p {artifact-dir}`

### 2. Invoke planner agent

Generate a UTC timestamp: `{YYYYMMDD-HHMMSSZ}`.

Call Task with `subagent_type: planner`, `max_turns: 40`:

> Break the following story into independently orchestrable implementation steps.
>
> Story: {task description}
>
> Write your plan to:
>
> - Plan markdown: {artifact-dir}/{timestamp}\_planner_orchestration-plan.md
> - Plan JSON: {artifact-dir}/orchestration-plan.json

### 3. Present plan

Read `{artifact-dir}/orchestration-plan.json`. Present to the user:

- **Overview**: the story summary
- **Steps**: numbered list with titles, file counts, and dependency info
- **Dependency graph**: which steps can run in parallel vs. which are sequential
- **Risks**: items that need user attention
- **Questions**: items the planner could not resolve from codebase analysis
  - When asking option-style questions, follow [`_data/recommendation-gradient.md`](../_data/recommendation-gradient.md). (Reinforces the rule in `AGENTS.md` — intentional redundancy.)

### 4. User feedback loop

Wait for user input. The user may:

- **Answer questions**: provide answers to the planner's questions
- **Give feedback**: request changes to step scope, ordering, or granularity
- **Approve**: confirm the plan is ready

If the user provides feedback (not approval):

1. Generate a new UTC timestamp for the updated plan.md.
2. Re-invoke the planner agent with the feedback. Call Task with `subagent_type: planner`, `max_turns: 40`:

> Update the plan based on user feedback.
>
> User feedback: {feedback}
>
> Read the current plan from: {artifact-dir}/orchestration-plan.json
>
> Write the updated plan to:
>
> - Plan markdown: {artifact-dir}/{new-timestamp}\_planner_orchestration-plan.md
> - Plan JSON: {artifact-dir}/orchestration-plan.json

3. Read the updated `orchestration-plan.json` and present the revised plan (return to step 3).

### 5. Finalization

When the user approves the plan:

1. Resolve provenance and identity data:
   - Run `git rev-parse --short origin/main` via Bash to obtain `{baseSha}`. If the command fails, omit `baseSha`.
   - Set `{timestamp}` to the current UTC time in ISO 8601 format.
   - Read `branch_name`, `ticket_id`, and `ticket_ref` from session context (obtained in step 1 of the Process above).
   - Run `git rev-parse --short HEAD` via Bash to obtain `{commit}`.
   - Resolve `{pr}` via the shared dispatch in [`../_data/pr-resolution.md`](../_data/pr-resolution.md). Read `platform` from session context, then run the matching snippet via the Bash tool with `timeout: 5000`:
     - **GitHub:** `gh pr list --head "$BRANCH" --state all --json url --jq '.[0].url // empty'`
     - **Bitbucket:** the `curl` snippet in `pr-resolution.md` against `https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}/pullrequests?q=source.branch.name="{branch}"`, extracting `.values[0].links.html.href`.

     On non-empty output, set `{pr}` to the URL. On empty output (no PR exists), omit `pr:` — emit no warning. On non-zero exit, timeout, or other failure, omit `pr:` and emit `Note: PR lookup failed; proceeding without pr field.` in the agent text output.

2. Add a frontmatter header to the latest plan markdown snapshot. List `{artifact-dir}/*_planner_orchestration-plan.md` files, sort lexicographically descending, and take the first (most recent by timestamp prefix). If no matching files are found, skip the frontmatter header step -- the planner did not produce a markdown snapshot. Read the file. Prepend YAML frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema and write back:

   ```yaml
   ---
   provenance:
     skill: plan-orchestrable-steps
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

3. Output confirmation:

   ```
   Plan finalized: {artifact-dir}/orchestration-plan.json
   {step count} steps ready for orchestration.
   ```

## Artifact layout

```
{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/
├── orchestration-plan.json                              <- machine-readable plan (mutable, overwritten each iteration)
├── 20260219-143000Z_planner_orchestration-plan.md       <- human-readable plan snapshot (iteration 1)
├── 20260219-144500Z_planner_orchestration-plan.md       <- human-readable plan snapshot (iteration 2, after feedback)
└── {run-id}/                              <- orchestration run directories (created later by /orchestrate-dev)
```

- `orchestration-plan.json` is a **ticket-level mutable artifact** — it is overwritten on each planning iteration, not timestamped
- `{timestamp}_planner_orchestration-plan.md` files are versioned snapshots — each planning iteration produces a new timestamped file
- The artifact directory is at the ticket level because `orchestration-plan.json` is shared across orchestration runs

## Constraints

- All codebase exploration and plan generation is delegated to the planner agent — do not analyze code directly
- The feedback loop is interactive — always wait for user input before resuming the planner
- Do not proceed to orchestration — the user invokes `/orchestrate-dev` separately when ready
