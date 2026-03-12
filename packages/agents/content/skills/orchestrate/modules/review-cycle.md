# Review cycle module

Orchestrate the parallel review, code-simplifier, and holistic review phases as a self-contained review cycle. This module is loaded and followed by the orchestrate engine — it is not a standalone skill.

## Inputs

The orchestrate engine must provide these context variables before entering this module:

| Variable                     | Description                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `{task}`                     | Task description                                                                                                    |
| `{run-dir}`                  | Run directory returned by `init_run`                                                                                |
| `{seq}`                      | Current artifact sequence counter (continue incrementing from this value)                                           |
| `{ticket-requirements-path}` | Full path to ticket-requirements artifact (empty string if unavailable)                                             |
| `{plan-md-path}`             | Full path to orchestration-plan.md artifact (empty string if planning was skipped)                                  |
| `{merge-base-sha}`           | Concrete merge-base SHA for diffing                                                                                 |
| `{change-summary-path}`      | Path to the most recent `coder_change-summary.md`                                                                   |
| `{max-review-rounds}`        | Maximum iterative review rounds before `needs_manual_review`                                                        |
| `{approval-threshold}`       | Findings at this level or above must be fixed for code approval (`low`, `medium`, or `high`)                        |
| `{budget-threshold}`         | Remaining review-round budget is spent only on findings at this level or above (`low`, `medium`, or `high`)         |
| `{models}`                   | Resolved model assignments map (see "Resolving models" in SKILL.md)                                                 |
| `{mcp-available}`            | `true` when MCP tools are available; `false` when the engine is running without MCP                                 |
| `{aspect_reviewers}`         | Aspect reviewer overrides from mode preset. Per-aspect: `false` = never activate, absent = use file-pattern default |

## Exit state

After this module completes, the orchestrate engine reads:

| Variable          | Values                               | Description                         |
| ----------------- | ------------------------------------ | ----------------------------------- |
| `{review-status}` | `converged` \| `needs_manual_review` | Overall outcome of the review cycle |
| `{seq}`           | integer                              | Updated artifact sequence counter   |

## Sub-phase tracking

Sub-phase state is recorded via `emit_event` calls at the points described in each sub-phase section below. Use `{run-dir}` for all MCP tool calls.

**`get_run_state` fallback policy:** If any `get_run_state` call fails (MCP server unavailable), fall back to conversation-tracked state and record a warning in the run summary. This applies to every `get_run_state` call in this module.

## Phase 4: Parallel review (required, max N iterations)

Dispatch the core reviewer and all aspect reviewers in parallel on the same code snapshot. All reviewers examine the initial implementation simultaneously, then findings are aggregated for a single fix cycle.

### Aspect reviewer activation

Before dispatching aspect reviewers, determine which ones are relevant to the change. The core reviewer (`orchestrated-reviewer`) always runs. Each aspect reviewer's activation is resolved in two steps:

1. **Check `{aspect_reviewers}` override**: if the reviewer has an explicit `false` in the `{aspect_reviewers}` map, skip it.
2. **Apply file-pattern default**: if no override exists (key absent from `{aspect_reviewers}`), activate based on the changed-file list:

| Aspect reviewer                                          | File-pattern default                                                                                            | Skip reason                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `aspect-code-reviewer` (key: `code`)                     | Always                                                                                                          | -                               |
| `aspect-silent-failure-reviewer` (key: `silent_failure`) | Changed files include source code (`.ts`, `.js`, `.tsx`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.sh`, `.zsh`)   | No source files changed         |
| `aspect-test-reviewer` (key: `test`)                     | Changed files include source code (same extensions as above) or test files (`*.test.*`, `*.spec.*`, `*_test.*`) | No source or test files changed |

### Dispatch

Before dispatching, compute the changed-file list once: `git diff --name-only {merge-base-sha}..HEAD`. Store as `{changed-files}`. Evaluate activation rules for each aspect reviewer.

Before: call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_started", phase: "review" } }`. Then emit one `reviewer_dispatched` event per dispatched reviewer:

```
Call MCP tool emit_event with:
  runDir: {run-dir}
  event: { event: "reviewer_dispatched", reviewer: "{reviewer-name}" }
```

Send all activated Task calls in a single message so they run concurrently. Each agent examines the branch diff independently.

Before dispatching, assign `{NN}` values and store named path variables for each activated reviewer using these names and this order: `{core-review-path}` (core reviewer, always), `{sf-review-path}` (silent-failure reviewer, if activated), `{test-review-path}` (test reviewer, if activated), `{code-review-path}` (code reviewer, if activated). Skipped reviewers do not consume a sequence number; increment `{seq}` only for activated reviewers.

Call Task with `subagent_type: orchestrated-reviewer`, `max_turns: 30`, `model: {models.reviewer}`:

> Review the code changes for the following task.
>
> Task description: {task}
>
> {If `{plan-md-path}` is non-empty: Implementation plan: Read `{plan-md-path}`}
> {If `{change-summary-path}` is non-empty: Coder's change summary: Read `{change-summary-path}`}
>
> Files changed:
> {changed-files}
>
> Diff base (merge-base SHA): `{merge-base-sha}`
>
> Write your review to: `{run-dir}/{NN}_reviewer_review.md`

Call Task with `subagent_type: aspect-silent-failure-reviewer`, `max_turns: 20`, `model: {models.aspect_silent_failure_reviewer}` (if activated):

> Review the code changes on this branch for error-handling and silent-failure issues.
>
> Task description: {task}
>
> Files changed:
> {changed-files}
>
> Use `git diff {merge-base-sha}..HEAD` to see all branch changes.
>
> Write your findings to: `{run-dir}/{NN}_silent-failure-reviewer_silent-failure-review.md`

Call Task with `subagent_type: aspect-test-reviewer`, `max_turns: 20`, `model: {models.aspect_test_reviewer}` (if activated):

> Review the code changes on this branch for test-coverage quality, behavioral gaps, and missing edge cases.
>
> Task description: {task}
>
> {If `{ticket-requirements-path}` is non-empty: Ticket requirements: Read `{ticket-requirements-path}`}
>
> Files changed:
> {changed-files}
>
> Use `git diff {merge-base-sha}..HEAD` to see all branch changes.
>
> Write your findings to: `{run-dir}/{NN}_test-reviewer_test-review.md`

Call Task with `subagent_type: aspect-code-reviewer`, `max_turns: 20`, `model: {models.aspect_code_reviewer}` (if activated):

> Review the code changes on this branch for CLAUDE.md compliance, bugs, and logic errors.
>
> Task description: {task}
>
> Files changed:
> {changed-files}
>
> Use `git diff {merge-base-sha}..HEAD` to see all branch changes.
>
> Write your findings to: `{run-dir}/{NN}_code-reviewer_code-review.md`

### Findings aggregation

After all dispatched reviewers complete, parse usage from each reviewer's Task result (see "Usage capture" in SKILL.md). Emit one `reviewer_completed` event per dispatched reviewer:

```
Call MCP tool emit_event with:
  runDir: {run-dir}
  event: { event: "reviewer_completed", reviewer: "{name}",
           status: "completed"|"failed", criticality: "{level}",
           tokens: {tokens}, toolUses: {toolUses}, durationMs: {durationMs} }
```

For each aspect reviewer that was **not activated** (skipped by activation rules), emit a separate `reviewer_completed` event (no usage fields — the agent was not invoked):

```
Call MCP tool emit_event with:
  runDir: {run-dir}
  event: { event: "reviewer_completed", reviewer: "{name}",
           status: "skipped", criticality: "none" }
```

Then aggregate findings from all sources into a consolidated set.

**Criticality aggregation:** For each reviewer, extract `Criticality` using Task return parsing (see SKILL.md). If extraction fails, treat that reviewer's criticality as `medium`. The **aggregated criticality** is the maximum across all active reviewers: `high` > `medium` > `low` > `none`. Skipped aspect reviewers do not contribute to aggregation.

**Deduplication heuristics:** If multiple reviewers flag the same file and line range (within 3 lines) with similar descriptions, consolidate into a single finding attributed to all relevant reviewers. When in doubt, keep findings separate — false deduplication is worse than redundant findings. Read each reviewer's artifact file to access finding details for deduplication and the consolidated coder fix prompt.

**Handling failures:** If an agent fails or times out, proceed with findings from the remaining agents and emit `reviewer_completed` with `status: "failed"` for that reviewer.

Call `register_artifact` for each reviewer's artifact file.

### Flow control

Call MCP tool `get_run_state` with `{ runDir: {run-dir} }`. Use the returned state for the following decision — specifically the authoritative aggregated criticality and `reviewRoundsUsed`.

Before applying these rules, check the iteration budget. If N iterations have been reached, exit with `needs_manual_review` regardless of criticality. Otherwise, use the aggregated criticality and the two thresholds to determine next steps:

- **criticality >= approval_threshold** AND review rounds remain: delegate fixes to coder, then run selective re-review. These findings must be fixed for code approval.
- **criticality >= approval_threshold** AND no review rounds remain: exit with `needs_manual_review`. These findings block approval and cannot be left unresolved.
- **criticality >= budget_threshold** (but below approval_threshold) AND review rounds remain: delegate fixes to coder, then run selective re-review. These findings are opportunistic — worth fixing if budget allows.
- **criticality >= budget_threshold** (but below approval_threshold) AND no review rounds remain: proceed to Phase 4a. These findings do not block approval, so exhausting budget is acceptable.
- **criticality < budget_threshold**: proceed to Phase 4a (report only, no fix attempt). This includes `none` (no actionable findings from any reviewer).

### Consolidated coder fixes

Before: call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "coder_fix_started", iteration: {N} } }`.

Call Task with `subagent_type: orchestrated-coder`, `max_turns: 80`, `model: {models.coder}`:

> Address the review findings for the following task.
>
> Task description: {task}
>
> The following reviewers identified issues. Prioritize critical/structural findings first.
>
> {If core reviewer had actionable findings: Core reviewer findings: Read `{core-review-path}`}
>
> {If silent-failure reviewer had actionable findings: Aspect silent-failure reviewer findings: Read `{sf-review-path}`}
>
> {If test reviewer had actionable findings: Aspect test reviewer findings: Read `{test-review-path}`}
>
> {If code reviewer had actionable findings: Aspect code reviewer findings: Read `{code-review-path}`}
>
> {Only include sections for reviewers that produced actionable findings.}
>
> Write your response to: `{run-dir}/{NN}_coder_change-summary.md`

After: update `{change-summary-path}` to the new file; increment `{seq}`. Parse usage from the coder's Task result (see "Usage capture" in SKILL.md). Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "coder_fix_completed", iteration: {N}, tokens: {tokens}, toolUses: {toolUses}, durationMs: {durationMs} } }`. Call `register_artifact` for the coder's change-summary artifact.

### Selective re-review

After the coder fix cycle, call MCP tool `get_run_state` with `{ runDir: {run-dir} }`. Use the returned state to read per-reviewer criticality and determine which reviewers need re-review.

Determine which reviewers' findings were addressed by examining the coder's change summary. Only re-dispatch reviewers whose findings the coder acted on — skip reviewers whose findings were already `none` or whose findings were deferred. Re-review is warranted whenever the coder acted on findings from one or more reviewers; the scope of re-review is limited to those reviewers.

Before dispatching re-review: call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "re_review_dispatched", reviewers: ["{name}", ...] } }`.

If re-review is warranted, assign new `{NN}` values for each re-dispatched reviewer (same sequencing rules as initial dispatch — only activated reviewers consume sequence numbers). Update the named path variables (`{core-review-path}`, `{sf-review-path}`, `{test-review-path}`, `{code-review-path}`) to point to the new artifact files. Old review files are preserved on disk.

Send re-review Task calls in a single message (parallel) using the same prompts, models, and turn budgets as the initial dispatch but adding context:

> {Same prompt as initial dispatch, with this addition:}
>
> This is a re-review after fixes were applied. Previous findings: {summary of this reviewer's original findings}. Coder's change summary: Read {change-summary-path}. Focus on verifying fixes and checking for regressions — not repeating previously resolved issues.

If a re-reviewer fails or times out, treat its original findings as unverified and include them in the aggregated criticality at their original severity. Emit `reviewer_completed` with `status: "failed"` for that reviewer.

After re-reviews complete: parse usage from each re-reviewer's Task result (see "Usage capture" in SKILL.md). Aggregate usage across all re-review Task results by summing `tokens`, `toolUses`, and `durationMs` independently. Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "re_review_completed", criticalities: { "{name}": "{level}", ... }, tokens: {summed-tokens}, toolUses: {summed-toolUses}, durationMs: {summed-durationMs} } }`. Call `register_artifact` for each re-reviewer's artifact file.

Aggregate findings again using the same rules. If new actionable findings emerge and review rounds remain (< N), loop back: run another coder fix cycle, then selective re-review. Repeat until convergence (aggregated criticality is `none`, or below both thresholds, or below approval_threshold with no remaining budget) or the iteration budget is exhausted.

### Loop termination

Call MCP tool `get_run_state` with `{ runDir: {run-dir} }`. Use the returned `reviewRoundsUsed` from state rather than relying on conversation-tracked iteration count.

- After N iterations unresolved (where N is the configured `max-review-rounds`): exit with `needs_manual_review` status. The iteration count includes the initial review dispatch as round 1 and each selective re-review as an additional round. With N=1, only the initial review dispatch runs — if findings exist, the phase exits as `needs_manual_review` with no fix attempt. Set N >= 2 for effective iterative review.
- Structural issues: may return to Planning once per run.

At phase completion (converged or `needs_manual_review`): compute aggregate usage for the entire review phase by summing `tokens`, `toolUses`, and `durationMs` across all Task calls within Phase 4 (all reviewer dispatches, coder fix cycles, and re-reviews). Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_completed", phase: "review", status: "completed"|"failed"|"needs_manual_review", tokens: {aggregate-tokens}, toolUses: {aggregate-toolUses}, durationMs: {aggregate-durationMs}, data: { aggregatedCriticality: "{level}", reviewRoundsUsed: {N} } } }`. Then emit `phase_decision` for `parallelReview`:

```
Call MCP tool emit_event with:
  runDir: {run-dir}
  event: { event: "phase_decision", phase: "parallelReview", run: true,
           reason: "executed" }
```

## Phase 4a: Code simplifier

After Phase 4 converges (aggregated criticality is below both thresholds, or after fix cycles reduce criticality below the approval threshold, or when the review budget is exhausted with remaining findings below the approval threshold), run code-simplifier as a sequential final pass. Code-simplifier operates on code that has passed all reviews — its purpose is polish, not correctness. Skip Phase 4a if Phase 4 exited with `needs_manual_review`. Code-simplifier failure should be recorded via `emit_event` but should NOT block progression to Phase 4b or fail the run.

Before dispatching code-simplifier, recompute the changed-file list: `git diff --name-only {merge-base-sha}..HEAD`. Store as `{changed-files}` (replaces the value computed at Phase 4 start, which may be stale after fix cycles).

Emit `phase_decision` for `codeSimplifier` before Phase 4a executes:

```
Call MCP tool emit_event with:
  runDir: {run-dir}
  event: { event: "phase_decision", phase: "codeSimplifier", run: true|false,
           reason: "{executed or skipped reason}" }
```

If Phase 4a will run: call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_started", phase: "simplifier" } }`.

If Phase 4a is skipped: call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_completed", phase: "simplifier", status: "skipped" } }`.

Call Task with `subagent_type: pr-review-toolkit:code-simplifier`, `max_turns: 15`, `model: {models.code_simplifier}`:

> Review the code changes on this branch for simplification opportunities.
>
> Task description: {task}
>
> Files changed:
> {changed-files}
>
> All review findings have been addressed. Focus on reducing unnecessary complexity: dead code, overly defensive patterns, verbose constructs that have simpler equivalents, and abstractions that don't earn their weight.
>
> Use `git diff {merge-base-sha}..HEAD` to see all branch changes.
>
> Write your findings to: `{run-dir}/{NN}_code-simplifier_code-simplifier-review.md`

After: store the full path as `{simplifier-review-path}`; increment `{seq}`. Read the findings file. Code-simplifier findings are NOT re-reviewed by other agents. If code-simplifier produced actionable findings, run one coder fix cycle. If the coder fix cycle fails, emit `phase_completed` with `status: "failed"` and proceed to Phase 4b.

Call Task with `subagent_type: orchestrated-coder`, `max_turns: 80`, `model: {models.coder}`:

> Address the code simplification findings for the following task.
>
> Task description: {task}
>
> Code-simplifier findings: Read `{simplifier-review-path}`
>
> These are polish changes — the code has already passed all reviews. Apply simplifications that clearly improve readability without changing behavior.
>
> Write your response to: `{run-dir}/{NN}_coder_change-summary.md`

After: if a coder fix cycle ran, update `{change-summary-path}` to the new file; increment `{seq}`. Compute aggregate usage for the simplifier phase by summing `tokens`, `toolUses`, and `durationMs` across all Task calls within Phase 4a (the code-simplifier dispatch and, if applicable, the coder fix cycle). Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_completed", phase: "simplifier", status: "completed", tokens: {aggregate-tokens}, toolUses: {aggregate-toolUses}, durationMs: {aggregate-durationMs}, data: { actionableFindings: true|false, coderFixCycleRan: true|false } } }` (or `status: "failed"` on failure; include usage fields on failure events too when available). Call `register_artifact` for the code-simplifier review artifact. If a coder fix cycle ran, also call `register_artifact` for the coder change-summary artifact.

## Phase 4b: Final comprehensive review

After the parallel review and code-simplifier complete, perform one additional review with a clean context. This is NOT part of the parallel review. Skip Phase 4b if Phase 4 exited with unresolved findings (`needs_manual_review`); in that case Phase 4a was also skipped — under the parallel review structure, `needs_manual_review` is the only non-converged exit path, so no other skip condition is needed. If Phase 4 converged, always run Phase 4b (whether or not Phase 4a produced findings).

The initial Phase 4b review always runs regardless of remaining budget. Phase 4b shares the review-round budget with Phase 4 only for subsequent fix-and-re-review cycles — rounds consumed in Phase 4 reduce the budget available for those cycles.

Call MCP tool `get_run_state` with `{ runDir: {run-dir} }`. Use the returned state to confirm whether Phase 4 exited `needs_manual_review` (which would skip Phase 4b) or converged.

Emit `phase_decision` for `holisticReview` before Phase 4b executes:

```
Call MCP tool emit_event with:
  runDir: {run-dir}
  event: { event: "phase_decision", phase: "holisticReview", run: true|false,
           reason: "{executed or skipped reason}" }
```

If Phase 4b will run: call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_started", phase: "holistic" } }`.

If Phase 4b is skipped: call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_completed", phase: "holistic", status: "skipped" } }`. Set `{review-status}` to `needs_manual_review` and exit the module.

Call Task with `subagent_type: orchestrated-reviewer`, `max_turns: 30`, `model: {models.holistic_reviewer}`:

> Perform a final review of all changes on this branch.
>
> Task description: {task}
>
> {If `{ticket-requirements-path}` is non-empty: Ticket requirements: Read `{ticket-requirements-path}`}
>
> This is a holistic assessment. Evaluate the branch as a whole — not individual lines or functions.
>
> Focus on:
>
> - Objective alignment: do the changes accomplish the stated task? Is anything missing? Are there changes that don't serve the objective?
> - Integration risk: could these changes break existing behavior? Test interactions between changed and unchanged code with concrete scenarios.
> - Completeness: trace task requirements to implementation — is every requirement addressed?
> - Unintended consequences: what could go wrong at system boundaries? Second-order effects?
>
> Use `git diff {merge-base-sha}..HEAD` to see all branch changes.
>
> Write your review to: `{run-dir}/{NN}_reviewer_holistic-review.md`

Store the full path as `{holistic-review-path}`; increment `{seq}`. Call `register_artifact` for the holistic review artifact.

### Flow control

Extract `Criticality` using Task return parsing (see SKILL.md).

Call MCP tool `get_run_state` with `{ runDir: {run-dir} }`. Use the returned state to read total `reviewRoundsUsed` across Phase 4 and 4b combined for the budget decision below.

- **criticality >= approval_threshold** AND review rounds remain: delegate fixes to coder, then re-review using remaining budget — apply the same threshold-based flow-control rules as Phase 4. If the budget is exhausted without resolution, set `{review-status}` to `needs_manual_review`.
- **criticality >= approval_threshold** AND no review rounds remain: delegate one coder fix round (no re-review), then set `{review-status}` to `converged`. These findings warranted a fix attempt but do not justify blocking approval when the budget is exhausted — the holistic review is a final sanity check, not a gating review.
- **criticality >= budget_threshold** (but below approval_threshold) AND review rounds remain: delegate fixes to coder, then re-review using remaining budget (opportunistic).
- **criticality >= budget_threshold** (but below approval_threshold) AND no review rounds remain: set `{review-status}` to `converged` (findings do not block approval).
- **criticality < budget_threshold**: set `{review-status}` to `converged` (report only). This includes `none` (no actionable findings).

After: compute aggregate usage for the holistic phase by summing `tokens`, `toolUses`, and `durationMs` across all Task calls within Phase 4b (the holistic reviewer dispatch and, if applicable, coder fix and re-review cycles). Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_completed", phase: "holistic", status: "completed"|"needs_manual_review", tokens: {aggregate-tokens}, toolUses: {aggregate-toolUses}, durationMs: {aggregate-durationMs}, data: { criticality: "{level}" } } }`. Call `register_artifact` for any coder change-summary artifacts produced during Phase 4b fix cycles.
