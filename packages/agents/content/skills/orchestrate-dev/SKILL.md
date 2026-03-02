---
name: orchestrate-dev
description: Full development workflow — architecture, planning, implementation, and review
user-invocable: true
---

# Orchestrate dev

Run a full development workflow by invoking the `orchestrate` engine with the complete pipeline.

<!-- TODO: remove migration note after transition -->

> **Migration note:** This skill replaces the legacy `/orchestrate` command for development workflows. The `/orchestrate` skill is now an internal engine and is not user-invocable. Use `/orchestrate-dev` for new development work.

## Arguments

- Task description (required): what to implement
- `--max-review-rounds=N`: maximum iterative review rounds (default: 3)
- `--diff-base=<ref>`: reference to diff against for reviews (default: project's default branch)
- `--fix-low` / `--no-fix-low`: whether to fix `low`-criticality findings (default: true)

## Pipeline

```
architecture (optional) → planning (optional) → implementation (required) → review-cycle (required)
```

| Phase            | Requirement | Description                                       |
| ---------------- | ----------- | ------------------------------------------------- |
| `architecture`   | `optional`  | Assess impact; runs based on task analysis        |
| `planning`       | `optional`  | Create implementation plan; runs based on task    |
| `implementation` | `required`  | Write code                                        |
| `review-cycle`   | `required`  | Parallel review, code-simplifier, holistic review |

## Process

Invoke the `orchestrate` skill with the pipeline specification above and pass through all arguments unchanged. The agent reads both this wrapper and the orchestrate engine instructions in the same conversation context. The pipeline table above **is** the pipeline specification — the engine reads the table entries (phase name + requirement level) and uses them directly to determine which phases to execute and in what order. No additional structured format is needed beyond this table.

## After the run

The orchestrate engine automatically offers `/wrap-up` when the run-summary contains deferred items or insights (Phase 6). For sessions where the orchestrator did not trigger wrap-up, or for follow-up housekeeping, invoke `/wrap-up` manually.
