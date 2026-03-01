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

1. Use `get-project-slug` to obtain the project slug.
2. Use `get-ticket-id` to obtain the ticket ID. If no ticket ID is available, auto-generate one: `{YYYYMMDD-HHMM}Z-{4 random alphanumeric}`.
3. **Resolve base directory**: Read `artifacts.base_dir` from `.agents/preferences.yaml`, falling back to `~/.agents/preferences.yaml`, then default `~/.ai`. If relative, resolve from project root (`git rev-parse --show-toplevel`). If absolute, use as-is.
4. **Resolve artifact directory**: `{base_dir}/projects/{project-slug}/tickets/{ticket-id}/` — this is the ticket level, NOT inside a run directory. `orchestration-plan.json` is a ticket-level mutable artifact.
5. `mkdir -p {artifact-dir}`

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

Output confirmation:

```
Plan finalized: {artifact-dir}/orchestration-plan.json
{step count} steps ready for orchestration.
```

## Artifact layout

```
{base_dir}/projects/{project-slug}/tickets/{ticket-id}/
├── orchestration-plan.json                              ← machine-readable plan (mutable, overwritten each iteration)
├── 20260219-143000Z_planner_orchestration-plan.md       ← human-readable plan snapshot (iteration 1)
├── 20260219-144500Z_planner_orchestration-plan.md       ← human-readable plan snapshot (iteration 2, after feedback)
└── {run-id}/                              ← orchestration run directories (created later by /orchestrate-dev)
```

- `orchestration-plan.json` is a **ticket-level mutable artifact** — it is overwritten on each planning iteration, not timestamped
- `{timestamp}_planner_orchestration-plan.md` files are versioned snapshots — each planning iteration produces a new timestamped file
- The artifact directory is at the ticket level because `orchestration-plan.json` is shared across orchestration runs

## Constraints

- All codebase exploration and plan generation is delegated to the planner agent — do not analyze code directly
- The feedback loop is interactive — always wait for user input before resuming the planner
- Do not proceed to orchestration — the user invokes `/orchestrate-dev` separately when ready
