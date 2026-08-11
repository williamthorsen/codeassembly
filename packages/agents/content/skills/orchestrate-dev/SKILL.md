---
name: orchestrate-dev
description: Full development workflow — architecture, planning, implementation, and review
user-invocable: true
---

# Orchestrate dev

Run a full development workflow by invoking the `orchestrate` engine with the complete pipeline.

## Arguments

- Task description (required): What to implement
- `--effort=<low|medium|high>`: Select an effort level (default: `medium`)
- `--max-review-rounds=N`: Maximum iterative review rounds (default: from effort preset)
- `--diff-base=<ref>`: Reference to diff against for reviews (default: project's default branch)
- `--approval-threshold=<low|medium|high>`: Findings at this level or above must be fixed for code approval (default: from effort preset)
- `--budget-threshold=<low|medium|high>`: Remaining review-round budget is spent only on findings at this level or above (default: from effort preset)
- `--architecture=<required|optional|absent>`: Override architecture phase requirement (default: `optional`)
- `--planning=<required|optional|absent>`: Override planning phase requirement (default: `optional`)
- `--models=<key:model,...>`: Model assignment overrides (e.g., `--models=coder:sonnet`)

### Deprecated arguments

- `--mode=<vibe|lite|strict>`: Deprecated. Use `--effort` instead. If both `--mode` and `--effort` are specified, `--effort` takes precedence. If only `--mode` is specified, map: `vibe` → `low`, `lite` → `medium`, `strict` → `high`.

## Effort presets

Effort defines a ceiling on permitted investment. The orchestrator right-sizes to the task; the effort level determines how far it is allowed to go. Each effort level is a preset bundle of settings. Any setting can be individually overridden via explicit CLI arguments (e.g., `--effort=low --architecture=required`).

| Setting            | `low`    | `medium` (default) | `high`   |
| ------------------ | -------- | ------------------ | -------- |
| approval-threshold | `high`   | `medium`           | `medium` |
| budget-threshold   | `high`   | `medium`           | `low`    |
| max-review-rounds  | 2        | 3                  | 4        |
| aspect-reviewers   | disabled | auto               | always   |
| architecture       | optional | optional           | optional |
| planning           | optional | optional           | optional |

The rule: Effort level inverts to threshold level; review infrastructure scales proportionally. No preset sets approval-threshold below `medium`, because `T`, `R`, and `S` are never merge-blocking (see the finding scheme's Merge-blocking column); budget-threshold keeps descending, which is how high effort buys opportunistic work on those tiers. An explicit `--approval-threshold` overrides the preset. Architecture and planning are always orchestrator-discretion — even at high effort, a one-line fix does not need architectural review.

### Effort x findings

How findings are handled at each effort level (see [review-criteria](../review-criteria/SKILL.md) for the finding scheme):

| Category           | Low effort | Medium effort   | High effort     |
| ------------------ | ---------- | --------------- | --------------- |
| F (FIXME)          | Fix        | Fix             | Fix             |
| W (Warning)        | Tolerate   | Fix             | Fix             |
| T (TODO)           | Ignore     | Ticket, defer   | Address now     |
| R (Recommendation) | Ignore     | Note in summary | Adopt or reject |
| S (Suggestion)     | Ignore     | Piggyback       | Piggyback       |

### Resolution cascade

For all effort-affected settings, values resolve in this order (highest priority first):

1. Explicit CLI argument
2. Effort preset (if `--effort` specified; `medium` if omitted)
3. `orchestration.<key>` in preferences.yaml
4. Engine default

### Piggybacking rule

Universal coder behavior, not effort-specific: During any fix cycle, also address `S`-tier suggestions in files already being modified. Do not seek out suggestions in untouched files. Thresholds control whether to initiate fix cycles; piggybacking controls what happens within one.

### Deferred-item handling

When findings are below the effort's approval threshold:

- **T (TODO) deferred**: Wrap-up creates a ticket. Tracked debt, not forgotten.
- **R (Recommendation) deferred**: Noted in run summary. Discretionary, no ticket.
- **S (Suggestion) deferred**: Not tracked. Ephemeral.

## Pipeline

All effort levels use the same pipeline. Architecture and planning requirements can be overridden via CLI arguments.

```
architecture (optional) -> planning (optional) -> implementation (required) -> review-cycle (required)
```

| Phase            | Requirement | Description                                                    |
| ---------------- | ----------- | -------------------------------------------------------------- |
| `architecture`   | `optional`  | Assess impact; runs based on task analysis                     |
| `planning`       | `optional`  | Create implementation plan; runs based on task                 |
| `implementation` | `required`  | Write code                                                     |
| `review-cycle`   | `required`  | Parallel review, code-simplification-reviewer, holistic review |

## Process

1. **Resolve effort**: If `--effort` is provided, look up the effort preset from the table above. If `--mode` is provided without `--effort`, map to effort level (`vibe` → `low`, `lite` → `medium`, `strict` → `high`). Default: `medium`.
2. **Apply overrides**: For each setting, apply the resolution cascade — explicit CLI arguments override effort presets, which override preferences, which override engine defaults.
3. **Resolve aspect reviewers**: Based on the effort preset's `aspect-reviewers` setting (`disabled`, `auto`, or `always`), set the `orchestration.aspect_reviewers` configuration. `disabled` sets all aspects to `false`. `always` sets all aspects to `true`. `auto` omits the configuration (engine uses default file-pattern activation).
4. **Build pipeline**: Apply any `--architecture` or `--planning` overrides to the pipeline table. If not overridden, use `optional` for both.
5. **Invoke the engine**: Invoke the `{skill:orchestrate}` skill with the pipeline specification and all resolved arguments. The pipeline table **is** the pipeline specification — the engine reads the table entries (phase name + requirement level) directly.

## After the run

The orchestrate engine automatically offers `{skill:wrap-up}` when the run-summary contains deferred items or insights (Phase 6). For sessions where the orchestrator did not trigger wrap-up, or for follow-up housekeeping, invoke `{skill:wrap-up}` manually.
