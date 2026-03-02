# Review cycle module

Orchestrate the parallel review, code-simplifier, and holistic review phases as a self-contained review cycle. This module is loaded and followed by the orchestrate engine — it is not a standalone skill.

## Inputs

The orchestrate engine must provide these context variables before entering this module:

| Variable                | Description                                                          |
| ----------------------- | -------------------------------------------------------------------- |
| `{task}`                | Task description                                                     |
| `{ticket-content}`      | GitHub issue body (empty string if unavailable)                      |
| `{artifact-dir}`        | Full path to the run artifact directory                              |
| `{merge-base-sha}`      | Concrete merge-base SHA for diffing                                  |
| `{change-summary-path}` | Path to the most recent `coder_change-summary.md`                    |
| `{max-review-rounds}`   | Maximum iterative review rounds before `needs_manual_review`         |
| `{approval-threshold}`  | Findings at this level or above must be fixed for code approval (`low`, `medium`, or `high`) |
| `{budget-threshold}`    | Remaining review-round budget is spent only on findings at this level or above (`low`, `medium`, or `high`) |
| `{models}`              | Resolved model assignments map (see "Resolving models" in SKILL.md)  |

## Exit state

After this module completes, the orchestrate engine reads:

| Variable          | Values                               | Description                         |
| ----------------- | ------------------------------------ | ----------------------------------- |
| `{review-status}` | `converged` \| `needs_manual_review` | Overall outcome of the review cycle |

## Sub-phase tracking

This module manages three sub-phases: `parallelReview`, `codeSimplifier`, and `holisticReview`. For each sub-phase, record **both** a `context.phaseDecisions` entry and a `context.phases` entry in run-index.json:

- **`context.phaseDecisions`**: record before executing the sub-phase. Use `{ "run": true, "disposition": "executed" }` if the sub-phase will run, or `{ "run": false, "disposition": "skipped", "reason": "..." }` if it is skipped (e.g., Phase 4a and 4b are skipped when Phase 4 exits with `needs_manual_review`).
- **`context.phases`**: record after the sub-phase completes, with the outcome data shown in each sub-phase section below.

## Phase 4: Parallel review (required, max N iterations)

Dispatch the core reviewer and all aspect reviewers in parallel on the same code snapshot. All reviewers examine the initial implementation simultaneously, then findings are aggregated for a single fix cycle.

### Aspect reviewer activation

Before dispatching aspect reviewers, determine which ones are relevant to the change. The core reviewer (`orchestrated-reviewer`) always runs. Each aspect reviewer activates based on the changed-file list:

| Aspect reviewer                  | Activates when                                                                                                  | Skip reason                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `aspect-code-reviewer`           | Always                                                                                                          | -                               |
| `aspect-silent-failure-reviewer` | Changed files include source code (`.ts`, `.js`, `.tsx`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.sh`, `.zsh`)   | No source files changed         |
| `aspect-test-reviewer`           | Changed files include source code (same extensions as above) or test files (`*.test.*`, `*.spec.*`, `*_test.*`) | No source or test files changed |

If `orchestration.aspect_reviewers` is configured in `.agents/preferences.yaml` or `~/.agents/preferences.yaml`, use it to override activation. Possible values per aspect:

- `true` — always activate (ignore file-pattern check)
- `false` — never activate
- absent — use default file-pattern activation above

If no `orchestration.aspect_reviewers` configuration exists, all aspects use their default activation logic (backward-compatible).

Example configuration in `.agents/preferences.yaml`:

```yaml
orchestration:
  aspect_reviewers:
    code: true # always activate (ignore file-pattern check)
    silent_failure: false # never activate
    # test: absent — uses default file-pattern activation
```

### Dispatch

Before dispatching, compute the changed-file list once: `git diff --name-only {merge-base-sha}..HEAD`. Store as `{changed-files}`. Evaluate activation rules for each aspect reviewer.

Before: write `context.phases.parallelReview` to run-index.json with `status: "in_progress"`, `startedAt: {ISO timestamp}`, and an initial `iterations` entry: `iterations[0]` with `reviewers: [{list of dispatched reviewer names}]` and `dispatchedAt: {ISO timestamp}`. Do not write `aggregatedCriticality` yet (unknown until batch completes). Write per-reviewer entries with `ran: true` and `startedAt: {ISO timestamp}`.

Send all activated Task calls in a single message so they run concurrently. Each agent examines the branch diff independently.

Call Task with `subagent_type: orchestrated-reviewer`, `max_turns: 30`, `model: {models.reviewer}`:

> Review the code changes for the following task.
>
> Task description: {task}
>
> {If planning phase ran: Implementation plan: Read `{artifact-dir}/{timestamp}_planner_orchestration-plan.md`}
> {If `{change-summary-path}` is non-empty: Coder's change summary: Read `{change-summary-path}`}
>
> Files changed:
> {changed-files}
>
> Diff base (merge-base SHA): `{merge-base-sha}`
>
> Write your review to: `{artifact-dir}/{timestamp}_reviewer_review.md`

Call Task with `subagent_type: aspect-silent-failure-reviewer`, `max_turns: 15`, `model: {models.aspect_silent_failure_reviewer}` (if activated):

> Review the code changes on this branch for error-handling and silent-failure issues.
>
> Task description: {task}
>
> Files changed:
> {changed-files}
>
> Use `git diff {merge-base-sha}..HEAD` to see all branch changes.
>
> Write your findings to: `{artifact-dir}/{timestamp}_silent-failure-reviewer_silent-failure-review.md`

Call Task with `subagent_type: aspect-test-reviewer`, `max_turns: 15`, `model: {models.aspect_test_reviewer}` (if activated):

> Review the code changes on this branch for test-coverage quality, behavioral gaps, and missing edge cases.
>
> Task description: {task}
>
> {If `{ticket-content}` is non-empty: Ticket requirements: Read `{artifact-dir}/{timestamp}_orchestrator_ticket-requirements.md`}
>
> Files changed:
> {changed-files}
>
> Use `git diff {merge-base-sha}..HEAD` to see all branch changes.
>
> Write your findings to: `{artifact-dir}/{timestamp}_test-reviewer_test-review.md`

Call Task with `subagent_type: aspect-code-reviewer`, `max_turns: 15`, `model: {models.aspect_code_reviewer}`:

> Review the code changes on this branch for CLAUDE.md compliance, bugs, and logic errors.
>
> Task description: {task}
>
> Files changed:
> {changed-files}
>
> Use `git diff {merge-base-sha}..HEAD` to see all branch changes.
>
> Write your findings to: `{artifact-dir}/{timestamp}_code-reviewer_code-review.md`

### Findings aggregation

After all dispatched reviewers complete, aggregate findings from all sources into a consolidated set.

**Criticality aggregation:** For each reviewer, extract `Criticality` using Task return parsing (see SKILL.md). If extraction fails, treat that reviewer's criticality as `medium`. The **aggregated criticality** is the maximum across all active reviewers: `high` > `medium` > `low` > `none`. Skipped aspect reviewers do not contribute to aggregation.

**Deduplication heuristics:** If multiple reviewers flag the same file and line range (within 3 lines) with similar descriptions, consolidate into a single finding attributed to all relevant reviewers. When in doubt, keep findings separate — false deduplication is worse than redundant findings. Read each reviewer's artifact file to access finding details for deduplication and the consolidated coder fix prompt.

**Handling failures:** If an agent fails or times out, proceed with findings from the remaining agents and record the failure in run-index.json. Use `"status": "failed"` in the reviewer entry to distinguish from activation-skipped (`"status": "skipped"`) and successful (`"status": "completed"`) reviewers.

### Flow control

Before applying these rules, check the iteration budget. If N iterations have been reached, exit with `needs_manual_review` regardless of criticality. Otherwise, use the aggregated criticality and the two thresholds to determine next steps:

- **criticality >= approval_threshold** AND review rounds remain: delegate fixes to coder, then run selective re-review. These findings must be fixed for code approval.
- **criticality >= approval_threshold** AND no review rounds remain: exit with `needs_manual_review`. These findings block approval and cannot be left unresolved.
- **criticality >= budget_threshold** (but below approval_threshold) AND review rounds remain: delegate fixes to coder, then run selective re-review. These findings are opportunistic — worth fixing if budget allows.
- **criticality >= budget_threshold** (but below approval_threshold) AND no review rounds remain: proceed to Phase 4a. These findings do not block approval, so exhausting budget is acceptable.
- **criticality < budget_threshold**: proceed to Phase 4a (report only, no fix attempt).
- **`none`** (no actionable findings from any reviewer): proceed to Phase 4a (code-simplifier).

### Consolidated coder fixes

Call Task with `subagent_type: orchestrated-coder`, `max_turns: 80`, `model: {models.coder}`:

> Address the review findings for the following task.
>
> Task description: {task}
>
> The following reviewers identified issues. Prioritize critical/structural findings first.
>
> {If core reviewer had actionable findings: Core reviewer findings: Read `{artifact-dir}/{timestamp}_reviewer_review.md`}
>
> {If silent-failure reviewer had actionable findings: Aspect silent-failure reviewer findings: Read `{artifact-dir}/{timestamp}_silent-failure-reviewer_silent-failure-review.md`}
>
> {If test reviewer had actionable findings: Aspect test reviewer findings: Read `{artifact-dir}/{timestamp}_test-reviewer_test-review.md`}
>
> {If code reviewer had actionable findings: Aspect code reviewer findings: Read `{artifact-dir}/{timestamp}_code-reviewer_code-review.md`}
>
> {Only include sections for reviewers that produced actionable findings.}
>
> Write your response to: `{artifact-dir}/{timestamp}_coder_change-summary.md`

### Selective re-review

After the coder fix cycle, determine which reviewers' findings were addressed by examining the coder's change summary. Only re-dispatch reviewers whose findings the coder acted on — skip reviewers whose findings were already `none` or whose findings were deferred. Re-review is warranted whenever the coder acted on findings from one or more reviewers; the scope of re-review is limited to those reviewers.

If re-review is warranted, send re-review Task calls in a single message (parallel) using the same prompts, models, and turn budgets as the initial dispatch but adding context:

> {Same prompt as initial dispatch, with this addition:}
>
> This is a re-review after fixes were applied. Previous findings: {summary of this reviewer's original findings}. Coder's change summary: Read {change-summary-path}. Focus on verifying fixes and checking for regressions — not repeating previously resolved issues.

If a re-reviewer fails or times out, treat its original findings as unverified and include them in the aggregated criticality at their original severity. Record the failure in run-index.json.

After re-reviews complete, aggregate findings again using the same rules. If new actionable findings emerge and review rounds remain (< N), loop back: run another coder fix cycle, then selective re-review. Repeat until convergence (aggregated criticality is `none`, or below both thresholds, or below approval_threshold with no remaining budget) or the iteration budget is exhausted.

### Loop termination

- After N iterations unresolved (where N is the configured `max-review-rounds`): exit with `needs_manual_review` status. The iteration count includes the initial review dispatch as round 1 and each selective re-review as an additional round. With N=1, only the initial review dispatch runs — if findings exist, the phase exits as `needs_manual_review` with no fix attempt. Set N >= 2 for effective iterative review.
- Structural issues: may return to Planning once per run.

### Incremental writes

Write run-index.json at every state transition within Phase 4:

**After the initial review batch completes:** update `context.phases.parallelReview` to add `iterations[0].reviewsCompletedAt: {ISO timestamp}` and the aggregated criticality. Write per-reviewer `completedAt`, `status`, and `criticality` for each reviewer entry.

**Before dispatching a coder fix cycle:** update `context.phases.parallelReview.iterations[n-1].coderFixStartedAt: {ISO timestamp}` (where n is the current iteration number).

**After a coder fix cycle completes:** update `iterations[n-1].coderFixCompletedAt: {ISO timestamp}`.

**Before dispatching selective re-review:** add a new `iterations[n]` entry with `reviewers: [{list of re-dispatched reviewer names}]` and `dispatchedAt: {ISO timestamp}`. Update per-reviewer `startedAt` for re-dispatched reviewers.

**After re-review completes:** update `iterations[n].reviewsCompletedAt: {ISO timestamp}` and per-reviewer `completedAt`, `status`, `criticality`, and `reReviewCriticality`.

**At phase completion:** write final `status: "completed"` (or `"failed"` / `"needs_manual_review"`), `completedAt: {ISO timestamp}`, and top-level `aggregatedCriticality`, `reviewRoundsUsed`, `coderFixCycleRan`, and `selectiveReReview` summary fields. Record `context.phaseDecisions.parallelReview` with `{ "run": true, "disposition": "executed" }` (see [artifact-conventions.md](../../_data/artifact-conventions.md) for the full schema).

## Phase 4a: Code simplifier

After all reviewers converge (aggregated criticality is `none` or `low`, or after fix cycles complete), run code-simplifier as a sequential final pass. Code-simplifier operates on code that has passed all reviews — its purpose is polish, not correctness. Skip Phase 4a if Phase 4 exited with `needs_manual_review`. Code-simplifier failure should be recorded in run-index.json but should NOT block progression to Phase 4b or fail the run.

Before dispatching code-simplifier, recompute the changed-file list: `git diff --name-only {merge-base-sha}..HEAD`. Store as `{changed-files}` (replaces the value computed at Phase 4 start, which may be stale after fix cycles).

Before: write `context.phases.codeSimplifier` to run-index.json with `status: "in_progress"` and `startedAt: {ISO timestamp}`.

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
> Write your findings to: `{artifact-dir}/{timestamp}_code-simplifier_code-simplifier-review.md`

After: read the findings file. Code-simplifier findings are NOT re-reviewed by other agents. If code-simplifier produced actionable findings, run one coder fix cycle. If the coder fix cycle fails, record the failure in run-index.json and proceed to Phase 4b.

Call Task with `subagent_type: orchestrated-coder`, `max_turns: 80`, `model: {models.coder}`:

> Address the code simplification findings for the following task.
>
> Task description: {task}
>
> Code-simplifier findings: Read `{artifact-dir}/{timestamp}_code-simplifier_code-simplifier-review.md`
>
> These are polish changes — the code has already passed all reviews. Apply simplifications that clearly improve readability without changing behavior.
>
> Write your response to: `{artifact-dir}/{timestamp}_coder_change-summary.md`

After: record `context.phaseDecisions.codeSimplifier` with `{ "run": true, "disposition": "executed" }` (or `{ "run": false, "disposition": "skipped", "reason": "Phase 4 exited with needs_manual_review" }` if skipped) and update `context.phases.codeSimplifier` in run-index.json with: `ran`, `actionableFindings`, `coderFixCycleRan`, `status: "completed"` (or `"failed"`), and `completedAt: {ISO timestamp}` (see [artifact-conventions.md](../../_data/artifact-conventions.md) for the full schema).

## Phase 4b: Final comprehensive review

After the parallel review and code-simplifier complete, perform one additional review with a clean context. This is NOT part of the parallel review. Skip Phase 4b if Phase 4 exited with unresolved findings (`needs_manual_review`); in that case Phase 4a was also skipped — under the parallel review structure, `needs_manual_review` is the only non-converged exit path, so no other skip condition is needed. If Phase 4 converged, always run Phase 4b (whether or not Phase 4a produced findings).

The initial Phase 4b review always runs regardless of remaining budget. Phase 4b shares the review-round budget with Phase 4 only for subsequent fix-and-re-review cycles — rounds consumed in Phase 4 reduce the budget available for those cycles.

Before: write `context.phases.holisticReview` to run-index.json with `status: "in_progress"` and `startedAt: {ISO timestamp}`.

Call Task with `subagent_type: orchestrated-reviewer`, `max_turns: 30`, `model: {models.holistic_reviewer}`:

> Perform a final review of all changes on this branch.
>
> Task description: {task}
>
> {If `{ticket-content}` is non-empty: Ticket requirements: Read `{artifact-dir}/{timestamp}_orchestrator_ticket-requirements.md`}
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
> Write your review to: `{artifact-dir}/{timestamp}_reviewer_holistic-review.md`

### Flow control

Extract `Criticality` using Task return parsing (see SKILL.md).

- **`none`**: set `{review-status}` to `converged`.
- **criticality >= approval_threshold** AND review rounds remain: delegate fixes to coder, then re-review using remaining budget — apply the same threshold-based flow-control rules as Phase 4. If the budget is exhausted without resolution, set `{review-status}` to `needs_manual_review`.
- **criticality >= approval_threshold** AND no review rounds remain: delegate one coder fix round (no re-review), then set `{review-status}` to `needs_manual_review`.
- **criticality >= budget_threshold** (but below approval_threshold) AND review rounds remain: delegate fixes to coder, then re-review using remaining budget (opportunistic).
- **criticality >= budget_threshold** (but below approval_threshold) AND no review rounds remain: set `{review-status}` to `converged` (findings do not block approval).
- **criticality < budget_threshold**: set `{review-status}` to `converged` (report only).

After: record `context.phaseDecisions.holisticReview` with `{ "run": true, "disposition": "executed" }` (or `{ "run": false, "disposition": "skipped", "reason": "Phase 4 exited with needs_manual_review" }` if skipped) and update `context.phases.holisticReview` in run-index.json with `status: "completed"` (or `"failed"` / `"needs_manual_review"`), `completedAt: {ISO timestamp}`, and the holistic review outcome (criticality and whether a coder fix round was needed).
