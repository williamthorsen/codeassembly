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
- `--mode=<vibe|strict>`: select a mode preset (default: no mode, preserving current behavior)
- `--max-review-rounds=N`: maximum iterative review rounds (default: 3)
- `--diff-base=<ref>`: reference to diff against for reviews (default: project's default branch)
- `--approval-threshold=<low|medium|high>`: findings at this level or above must be fixed for code approval (default: `low`)
- `--budget-threshold=<low|medium|high>`: remaining review-round budget is spent only on findings at this level or above (default: `low`)
- `--fix-low` / `--no-fix-low`: backward-compatible aliases. `--fix-low` is equivalent to `--approval-threshold=low --budget-threshold=low`. `--no-fix-low` is equivalent to `--approval-threshold=medium --budget-threshold=medium`.

## Mode presets

Each mode is a preset bundle of settings. When `--mode` is specified, its preset values apply as defaults. Any setting can be individually overridden via explicit CLI arguments (e.g., `--mode=vibe --approval-threshold=medium`).

| Setting             | `vibe`      | (default) | `strict` |
| ------------------- | ----------- | --------- | -------- |
| architecture        | excluded    | optional  | required |
| planning            | excluded    | optional  | required |
| aspect_reviewers    | all `false` | —         | —        |
| approval-threshold  | high        | low       | low      |
| budget-threshold    | high        | low       | low      |
| holistic_reviewer\* | sonnet      | opus      | opus     |
| max-review-rounds   | 1           | 3         | 4        |

\* `holistic_reviewer` uses snake_case because it is a `--models` key (passed as `--models=holistic_reviewer:sonnet`), not a standalone argument. See the engine's [model resolution](../orchestrate/SKILL.md#resolving-models) for details.

### Resolution cascade

For all mode-affected settings, values are resolved in this order (highest priority first):

1. Explicit CLI argument
2. Mode preset (if `--mode` specified)
3. `orchestration.<key>` in preferences.yaml
4. Legacy alias (`fix_low_findings` mapped to thresholds)
5. Engine default

\* `aspect_reviewers` is resolved from the mode preset only (step 2). It has no CLI argument, no preferences.yaml lookup, and no engine default. When no mode is specified, the engine receives an empty map and all aspect reviewers fall through to file-pattern defaults (see `review-cycle.md`).

### Pipeline per mode

**Default** (no `--mode`):

```
architecture (optional) -> planning (optional) -> implementation (required) -> review-cycle (required)
```

| Phase            | Requirement | Description                                       |
| ---------------- | ----------- | ------------------------------------------------- |
| `architecture`   | `optional`  | Assess impact; runs based on task analysis        |
| `planning`       | `optional`  | Create implementation plan; runs based on task    |
| `implementation` | `required`  | Write code                                        |
| `review-cycle`   | `required`  | Parallel review, code-simplifier, holistic review |

**`--mode=vibe`**:

```
implementation (required) -> review-cycle (required)
```

| Phase            | Requirement | Description                                       |
| ---------------- | ----------- | ------------------------------------------------- |
| `implementation` | `required`  | Write code                                        |
| `review-cycle`   | `required`  | Parallel review, code-simplifier, holistic review |

Vibe mode skips architecture and planning and deactivates all aspect reviewers — only the core reviewer runs. See the mode preset table above.

**`--mode=strict`**:

```
architecture (required) -> planning (required) -> implementation (required) -> review-cycle (required)
```

| Phase            | Requirement | Description                                       |
| ---------------- | ----------- | ------------------------------------------------- |
| `architecture`   | `required`  | Assess impact; always runs                        |
| `planning`       | `required`  | Create implementation plan; always runs           |
| `implementation` | `required`  | Write code                                        |
| `review-cycle`   | `required`  | Parallel review, code-simplifier, holistic review |

## Process

1. **Resolve mode**: if `--mode` is provided, look up the mode preset from the table above.
2. **Apply overrides**: for each setting, apply the resolution cascade — explicit CLI arguments override mode presets, which override preferences, which override engine defaults. For model-related settings (like `holistic_reviewer`), pass the resolved value to the engine via `--models` (e.g., `--models=holistic_reviewer:sonnet`).
3. **Select pipeline**: use the pipeline table corresponding to the resolved mode.
4. **Invoke the engine**: invoke the `orchestrate` skill with the selected pipeline specification and all resolved arguments. The agent reads both this wrapper and the orchestrate engine instructions in the same conversation context. The pipeline table for the resolved mode **is** the pipeline specification — the engine reads the table entries (phase name + requirement level) and uses them directly to determine which phases to execute and in what order. No additional structured format is needed beyond this table.

## After the run

The orchestrate engine automatically offers `/wrap-up` when the run-summary contains deferred items or insights (Phase 6). For sessions where the orchestrator did not trigger wrap-up, or for follow-up housekeeping, invoke `/wrap-up` manually.
