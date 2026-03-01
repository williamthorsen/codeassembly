---
name: orchestrate-review
description: Review-only workflow — run the full review cycle on existing branch changes
user-invocable: true
---

# Orchestrate review

Run the review cycle on existing branch changes by invoking the `orchestrate` engine with a review-only pipeline. No architecture, planning, or implementation phases run.

## Use cases

- **Post-implementation review**: code was written manually or by a non-orchestrated agent and needs the full review cycle (parallel review, code-simplifier, holistic review).
- **Re-review after manual fixes**: a previous orchestrated run exited with `needs_manual_review`, fixes were applied manually, and a fresh review cycle is needed.
- **External PR review**: review changes on a branch that was created outside the orchestration workflow.

Use `orchestrate-dev` instead when you need the full development workflow (architecture, planning, implementation, and review).

## Prerequisites

- A branch with changes relative to the diff base (the review cycle needs a diff to review).
- A task description explaining what the changes accomplish (reviewers need context).

## Arguments

- Task description (required): what the branch changes accomplish
- `--max-review-rounds=N`: maximum iterative review rounds (default: 3)
- `--diff-base=<ref>`: reference to diff against for reviews (default: project's default branch)
- `--fix-low` / `--no-fix-low`: whether to fix `low`-criticality findings (default: true)

## Pipeline

```
review-cycle (required)
```

| Phase          | Requirement | Description                                       |
| -------------- | ----------- | ------------------------------------------------- |
| `review-cycle` | `required`  | Parallel review, code-simplifier, holistic review |

## Process

1. **Validate prerequisites**: run `git diff --name-only {merge-base-sha}..HEAD` (where `{merge-base-sha}` is resolved from `--diff-base` or the project's default branch) and confirm output is non-empty. If empty, exit with error: "No changes to review on this branch relative to the diff base." Verify a task description is provided and non-empty.
2. **Invoke the engine**: invoke the `orchestrate` skill with the pipeline specification above and pass through all arguments unchanged. The agent reads both this wrapper and the orchestrate engine instructions in the same conversation context. The pipeline table above **is** the pipeline specification — the engine reads the table entries (phase name + requirement level) and uses them directly to determine which phases to execute. No additional structured format is needed beyond this table.

Phases absent from the pipeline are handled by the engine's standard disposition logic. The `{change-summary-path}` is resolved from the most recent `coder_change-summary.md` in the artifact directory if one exists from a prior run, or empty if this is the first run for this ticket (see the engine's context preparation section for resolution logic).
