---
name: plan-orchestrable-steps
description: Break a story into independently orchestrable steps with interactive refinement
user-invocable: true
---

# Plan

Decompose a story or task into independently orchestrable implementation steps. Each step produces a self-contained task description suitable for `/orchestrate-dev`. The plan is refined interactively through user feedback.

## Arguments

- Story/task description (required): What to decompose into implementation steps

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

- **Overview**: The story summary
- **Steps**: Numbered list with titles, file counts, and dependency info
- **Dependency graph**: Which steps can run in parallel vs. which are sequential
- **Risks**: Items that need user attention
- **Questions**: Items the planner could not resolve from codebase analysis
  - When asking option-style questions, follow [`_data/recommendation-gradient.md`](../_data/recommendation-gradient.md). (Reinforces the rule in `AGENTS.md` — intentional redundancy.)

### 4. User feedback loop

Wait for user input. The user may:

- **Answer questions**: Provide answers to the planner's questions
- **Give feedback**: Request changes to step scope, ordering, or granularity
- **Approve**: Confirm the plan is ready

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

1. Resolve frontmatter fields. The frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

   Run `{platform_home_dir}/scripts/resolve-frontmatter.sh --skill plan-orchestrable-steps --interactive true` via Bash. Prepend the output verbatim to the artifact body.

   If the script's stderr contains `Note: PR lookup failed; proceeding without pr field.`, surface that line in your text output once.

2. Add a frontmatter header to the latest plan markdown snapshot. List `{artifact-dir}/*_planner_orchestration-plan.md` files, sort lexicographically descending, and take the first (most recent by timestamp prefix). If no matching files are found, skip the frontmatter header step — the planner did not produce a markdown snapshot. Read the file, prepend the resolved frontmatter, and write back.

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
