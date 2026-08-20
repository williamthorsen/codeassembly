# Review cycle module

Orchestrate the parallel review, code-simplification-reviewer, and holistic review phases as a self-contained review cycle. This module is loaded and followed by the orchestrate engine; it is not a standalone skill.

## Inputs

The orchestrate engine must provide these context variables before entering this module:

| Variable                          | Description                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `{task}`                          | Task description                                                                                                    |
| `{run-dir}`                       | Run directory returned by `init_run`                                                                                |
| `{seq}`                           | Current artifact sequence counter (continue incrementing from this value)                                           |
| `{ticket-requirements-path}`      | Full path to ticket-requirements artifact (empty string if unavailable)                                             |
| `{plan-md-path}`                  | Full path to orchestration-plan.md artifact (empty string if planning was skipped)                                  |
| `{merge-base-sha}`                | Concrete merge-base SHA for diffing                                                                                 |
| `{change-summary-path}`           | Path to the most recent `coder_change-summary.md`                                                                   |
| `{max-review-rounds}`             | Maximum iterative review rounds before `needs_manual_review`                                                        |
| `{approval-threshold}`            | Findings at this level or above must be fixed for code approval (`low`, `medium`, or `high`)                        |
| `{budget-threshold}`              | Remaining review-round budget is spent only on findings at this level or above (`low`, `medium`, or `high`)         |
| `{models}`                        | Resolved model assignments map (see "Resolving models" in SKILL.md)                                                 |
| `{mcp-available}`                 | `true` when MCP tools are available; `false` when the engine is running without MCP                                 |
| `{aspect_reviewers}`              | Aspect reviewer overrides from mode preset. Per-aspect: `false` = never activate, absent = use file-pattern default |
| `{authored-by-pipeline}`          | `true` when the pipeline includes an implementation phase (code was authored by the pipeline); `false` otherwise    |
| `{lookup-path}`                   | Path to the reviewer-context lookup table (`reviewer-context-packages.md`)                                          |
| `{reviewer-context-sidecar-path}` | Path to the most recent coder-emitted reviewer-context sidecar (empty string if none)                               |

## Exit state

After this module completes, the orchestrate engine reads:

| Variable          | Values                               | Description                         |
| ----------------- | ------------------------------------ | ----------------------------------- |
| `{review-status}` | `converged` \| `needs_manual_review` | Overall outcome of the review cycle |
| `{seq}`           | integer                              | Updated artifact sequence counter   |

## Sub-phase tracking

Sub-phase state is recorded via `emit_event` calls at the points described in each sub-phase section below. Use `{run-dir}` for all MCP tool calls.

**`get_run_state` fallback policy:** If any `get_run_state` call fails (MCP server unavailable), fall back to conversation-tracked state and record a warning in the run summary. This applies to every `get_run_state` call in this module.

## Reviewer-context assembly

Every reviewer dispatch and re-dispatch in this module includes a conditional `## Reviewer context` block in its prompt. This sub-section defines how the block is computed; each dispatch site below references it. Do not inline this logic at the dispatch sites; keep the assembly definition single-sourced here.

The block is assembled from two independent sources by the helper script `{harness_home_dir}/scripts/resolve-reviewer-context.sh`:

1. The most recent coder-emitted sidecar artifact (`{reviewer-context-sidecar-path}`), if present.
2. Static lookup-table entries from `{lookup-path}` whose package keys are statically imported or required by any changed file.

### Steps

1. **Recompute the changed-file list:** The dispatch site already has `{changed-files}` available (Phase 4 computes it once at the start of the parallel review; Phase 4a recomputes it before the simplifier dispatch; Phase 4b recomputes it before the holistic dispatch). Write the value to a temp file `{run-dir}/.tmp_changed-files.txt`. The temp file is overwritten on each call; no explicit cleanup is required because the run-dir is per-run.

2. **Invoke the helper script:** Capture stdout into `{reviewer-context}` and redirect stderr to a temp file so the failure-handling step below can read it:

   ```
   # Only include --sidecar when {reviewer-context-sidecar-path} is non-empty;
   # omit the flag entirely when the variable is an empty string.
   bash {harness_home_dir}/scripts/resolve-reviewer-context.sh \
     --sidecar "{reviewer-context-sidecar-path}" \
     --changed-files "{run-dir}/.tmp_changed-files.txt" \
     --lookup "{lookup-path}" \
     2>"{run-dir}/.tmp_reviewer-context-stderr.txt"
   ```

   The temp stderr file is overwritten on each call; no explicit cleanup is required because the run-dir is per-run.

3. **Inline conditionally:** If `{reviewer-context}` is non-empty, the dispatch's prompt template appends a final block:

   ```
   ## Reviewer context

   {reviewer-context}
   ```

   If `{reviewer-context}` is empty, the entire `## Reviewer context` section is omitted from the prompt; do not emit an empty heading.

### Failure handling

If the helper script exits non-zero, record a one-line warning in the run summary (`reviewer-context resolver failed: {stderr excerpt}`) and proceed with `{reviewer-context}` set to empty. Read the first line of `{run-dir}/.tmp_reviewer-context-stderr.txt` as `{stderr excerpt}`; if that file is empty or missing, log the exit code in its place. **Do not abort the dispatch.** The slot is optional context, not required input: The reviewer can do its job without it. The slot is a budget-saver, not a correctness gate.

### Re-computation policy

The assembly is recomputed for each reviewer dispatch and re-dispatch, not cached. The script runs locally in well under a second, and recomputation ensures correctness when the changed-file set changes between dispatches (e.g., after a coder fix cycle adds new files).

## Constrained re-dispatch template

When a reviewer dispatch is interrupted (typically `max_turns` exhaustion), the engine constructs a constrained retry prompt by splicing four ordered parts into the original dispatch shape. This sub-section defines the parts and their resolution rules; the "Retry-on-interruption hook" below describes when and how the template is applied.

### Parts

The retry prompt is assembled by prepending parts 1-3 above the original prompt body and appending part 4 at the end. The original prompt body, including any `## Reviewer context` block, is preserved verbatim.

1. **Budget warning** (always present, prepended first):

   ```
   Investigation budget is tight: You must produce a structured return.
   ```

2. **File allow-list** (always present, prepended after the budget warning):

   ```
   Files to read (and only these): {file-allow-list}. Do NOT explore additional files.
   ```

3. **Negative scope guardrails** (prepended after the file allow-list, only when peer findings exist):

   ```
   The following reviewers already produced findings: {peer-coverage-summary}. Do NOT re-investigate those areas.
   ```

   Omit this block entirely when no peer findings are available; do not emit a header with no body.

4. **Forced structured return** (always present, appended at the end of the prompt):

   ```
   You MUST produce a structured return: Even if you only have time to verify N of M items, write the partial review and return.
   ```

### Resolution

- **`{file-allow-list}`**: Extracted from the interrupted reviewer's partial artifact at its original write-target path. Take all file paths cited in the partial's findings list (the `### Findings` section) and any paths cited elsewhere in the scaffold. Deduplicate. If the partial yields no file references, fall back to the full `{changed-files}` set computed at the dispatch site.
- **`{peer-coverage-summary}`**: For Phase 4 retries, draw from peer reviewers in the same parallel batch whose {tool:Task} return parsed cleanly with a finalized `### Criticality:` enum value. For Phase 4a and Phase 4b retries, draw from the Phase 4 batch's completed reviewers (always available by that point). Format as a comma-separated list of `{reviewer-name}: {one-line scope or focus area}` entries derived from each peer's findings file. If no peer findings are available, the negative-scope block is omitted entirely.

## Retry-on-interruption hook

After every reviewer dispatch (including selective re-reviews and Phase 4b re-reviews), the engine checks whether the dispatch was interrupted. On interruption, it dispatches one constrained retry using the "Constrained re-dispatch template" above, then proceeds with the retry's outcome.

### Trigger

The trigger is uniform across all five reviewers (`orchestrated-reviewer`, `aspect-code-reviewer`, `aspect-silent-failure-reviewer`, `aspect-test-reviewer`, `code-simplification-reviewer`):

The artifact at the dispatch's write-target path contains `### Criticality: (pending)` (the literal interruption sentinel) instead of a finalized enum value (`none|low|medium|high`), or the artifact file is missing entirely.

The `(pending)` sentinel is written by every reviewer subagent during its scaffold step (see each subagent's "Incremental review writes" section) and replaced with the finalized criticality only at the end of a successful run. Its presence at parse time is the canonical signal that the dispatch did not converge.

### On trigger

For each interrupted reviewer:

1. Resolve template inputs per the "Constrained re-dispatch template" sub-section's rules: `{file-allow-list}` from the partial artifact, `{peer-coverage-summary}` from peers.
2. Construct the retry prompt by splicing the four template parts into the original dispatch shape (same `subagent_type`, `max_turns`, `model`, write-target path, original prompt body including any `## Reviewer context` block).
3. Dispatch one retry. Parse return via the same return-parsing rules as the initial dispatch and re-check the artifact for the `(pending)` sentinel.
4. If the retry also exhausts (sentinel still present, or artifact still missing), fall through to the existing "Recovery from reviewer interruption" rule in `SKILL.md`: Record the dispatch as `failed`, retain the partial findings list, and contribute `medium` criticality to aggregation.

### Properties

- **Round budget:** Retries do **not** increment `reviewRoundsUsed`. They are recovery within an existing round, not a new round.
- **Phase 4 retry timing:** In Phase 4's parallel batch, retries are dispatched after the entire batch completes (before findings aggregation), so peer reviewers' completed structured returns are available to populate `{peer-coverage-summary}`. Multiple Phase 4 retries dispatch in parallel.
- **Phase 4a and 4b:** Each phase's single reviewer retries serially (single retry, single re-dispatch). The retry of an initial Phase 4b dispatch is exempt from Phase 4b's "shares budget for re-review cycles" rule; the initial dispatch and its retry always run regardless of remaining `reviewRoundsUsed`.
- **Selective re-review and Phase 4b re-review:** These dispatches are subject to the hook on the same terms as initial dispatches. A re-review can also exhaust.

## Phase 4: Parallel review (required, max N iterations)

Dispatch the core reviewer and all aspect reviewers in parallel on the same code snapshot. All reviewers examine the initial implementation simultaneously, then findings are aggregated for a single fix cycle.

### Aspect reviewer activation

Before dispatching aspect reviewers, determine which ones are relevant to the change. The core reviewer (`orchestrated-reviewer`) always runs. Each aspect reviewer's activation is resolved in two steps:

1. **Check `{aspect_reviewers}` override**: If the reviewer has an explicit `false` in the `{aspect_reviewers}` map, skip it.
2. **Apply file-pattern default**: If no override exists (key absent from `{aspect_reviewers}`), activate based on the changed-file list:

| Aspect reviewer                                          | File-pattern default                                                                                            | Skip reason                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `aspect-code-reviewer` (key: `code`)                     | Always                                                                                                          | -                               |
| `aspect-silent-failure-reviewer` (key: `silent_failure`) | Changed files include source code (`.ts`, `.js`, `.tsx`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.sh`, `.zsh`)   | No source files changed         |
| `aspect-test-reviewer` (key: `test`)                     | Changed files include source code (same extensions as above) or test files (`*.test.*`, `*.spec.*`, `*_test.*`) | No source or test files changed |

### Dispatch

Before dispatching, compute the changed-file list once: `git diff --name-only {merge-base-sha}..HEAD`. Store as `{changed-files}`. Evaluate activation rules for each aspect reviewer.

Run the reviewer-context assembly steps once (see "Reviewer-context assembly" above) and capture `{reviewer-context}`. The same value is appended to every reviewer prompt in this dispatch (core + activated aspects). The block is recomputed for the re-review pass, not cached.

Before: Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_started", phase: "review" } }`. Then emit one `reviewer_dispatched` event per dispatched reviewer:

```
Call MCP tool emit_event with:
  runDir: {run-dir}
  event: { event: "reviewer_dispatched", reviewer: "{reviewer-name}" }
```

Send all activated {tool:Task} calls in a single message so they run concurrently. Each agent examines the branch diff independently.

Before dispatching, assign `{NN}` values and store named path variables for each activated reviewer using these names and this order: `{core-review-path}` (core reviewer, always), `{sf-review-path}` (silent-failure reviewer, if activated), `{test-review-path}` (test reviewer, if activated), `{code-review-path}` (code reviewer, if activated). Skipped reviewers do not consume a sequence number; increment `{seq}` only for activated reviewers.

Call {tool:Task} with `subagent_type: orchestrated-reviewer`, `max_turns: 60`, `model: {models.reviewer}`:

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
>
> {If `{reviewer-context}` is non-empty, append: `## Reviewer context\n\n{reviewer-context}` (see "Reviewer-context assembly" above). Omit the entire block when `{reviewer-context}` is empty; do not emit an empty heading.}

Call {tool:Task} with `subagent_type: aspect-silent-failure-reviewer`, `max_turns: 45`, `model: {models.aspect_silent_failure_reviewer}` (if activated):

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
>
> {If `{reviewer-context}` is non-empty, append: `## Reviewer context\n\n{reviewer-context}` (see "Reviewer-context assembly" above). Omit when empty.}

Call {tool:Task} with `subagent_type: aspect-test-reviewer`, `max_turns: 45`, `model: {models.aspect_test_reviewer}` (if activated):

> Review the code changes on this branch for test-coverage quality, behavioral gaps, and missing edge cases.
>
> Task description: {task}
>
> {If `{ticket-requirements-path}` is non-empty: Ticket requirements: Read `{ticket-requirements-path}`}
>
> {If `{authored-by-pipeline}` is `true`: This code was authored by the orchestrated pipeline (`authored-by-pipeline: true`). Classify untested branch-authored behavior as F (not T). See your classification guidance for details.}
>
> Files changed:
> {changed-files}
>
> Use `git diff {merge-base-sha}..HEAD` to see all branch changes.
>
> Write your findings to: `{run-dir}/{NN}_test-reviewer_test-review.md`
>
> {If `{reviewer-context}` is non-empty, append: `## Reviewer context\n\n{reviewer-context}` (see "Reviewer-context assembly" above). Omit when empty.}

Call {tool:Task} with `subagent_type: aspect-code-reviewer`, `max_turns: 45`, `model: {models.aspect_code_reviewer}` (if activated):

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
>
> {If `{reviewer-context}` is non-empty, append: `## Reviewer context\n\n{reviewer-context}` (see "Reviewer-context assembly" above). Omit when empty.}

### Retry interrupted dispatches

After the parallel batch returns and before parsing usage or aggregating findings, apply the "Retry-on-interruption hook" (see above) per-reviewer. Any reviewer whose artifact still contains the `### Criticality: (pending)` sentinel (or whose artifact is missing) is retried once with the constrained re-dispatch shape. Retries are dispatched in parallel when multiple reviewers were interrupted. Wait for all retries to complete before proceeding to "Findings aggregation".

### Findings aggregation

After all dispatched reviewers complete, parse usage from each reviewer's {tool:Task} result (see "Usage capture" in SKILL.md). Emit one `reviewer_completed` event per dispatched reviewer:

```
Call MCP tool emit_event with:
  runDir: {run-dir}
  event: { event: "reviewer_completed", reviewer: "{name}",
           status: "completed"|"failed", criticality: "{level}",
           tokens: {tokens}, toolUses: {toolUses}, durationMs: {durationMs} }
```

For each aspect reviewer that was **not activated** (skipped by activation rules), emit a separate `reviewer_completed` event (no usage fields, since the agent was not invoked):

```
Call MCP tool emit_event with:
  runDir: {run-dir}
  event: { event: "reviewer_completed", reviewer: "{name}",
           status: "skipped", criticality: "none" }
```

Then aggregate findings from all sources into a consolidated set.

**Criticality aggregation:** For each reviewer, extract `Criticality` using {tool:Task} return parsing (see SKILL.md). If extraction fails, treat that reviewer's criticality as `medium`. The **aggregated criticality** is the maximum across all active reviewers: `high` > `medium` > `low` > `none`. Skipped aspect reviewers do not contribute to aggregation.

**Deduplication heuristics:** If multiple reviewers flag the same file and line range (within 3 lines) with similar descriptions, consolidate into a single finding attributed to all relevant reviewers. When in doubt, keep findings separate; false deduplication is worse than redundant findings. Read each reviewer's artifact file to access finding details for deduplication and the consolidated coder fix prompt.

**Handling failures:** If an agent fails or times out, proceed with findings from the remaining agents and emit `reviewer_completed` with `status: "failed"` for that reviewer. For partial-artifact handling (when a reviewer was interrupted mid-analysis but its incremental scaffold left findings on disk), see "Recovery from reviewer interruption" in `SKILL.md`'s Error handling section.

Call `register_artifact` for each reviewer's artifact file.

### Flow control

Call MCP tool `get_run_state` with `{ runDir: {run-dir} }`. Use the returned state for the following decision, specifically the authoritative aggregated criticality and `reviewRoundsUsed`.

Before applying these rules, check the iteration budget. If N iterations have been reached, exit with `needs_manual_review` regardless of criticality. Otherwise, use the aggregated criticality and the two thresholds to determine next steps:

- **criticality >= approval_threshold** AND review rounds remain: Delegate fixes to coder, then run selective re-review. These findings must be fixed for code approval.
- **criticality >= approval_threshold** AND no review rounds remain: Exit with `needs_manual_review`. These findings block approval and cannot be left unresolved.
- **criticality >= budget_threshold** (but below approval_threshold) AND review rounds remain: Delegate fixes to coder, then run selective re-review. These findings are opportunistic, worth fixing if budget allows.
- **criticality >= budget_threshold** (but below approval_threshold) AND no review rounds remain: Proceed to Phase 4a. These findings do not block approval, so exhausting budget is acceptable.
- **criticality < budget_threshold**: Proceed to Phase 4a (report only, no fix attempt). This includes `none`, where reviewers produced no authored findings.

### Consolidated coder fixes

Before: Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "coder_fix_started", iteration: {N} } }`.

Call {tool:Task} with `subagent_type: orchestrated-coder`, `max_turns: 150`, `model: {models.coder}`:

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

After: Update `{change-summary-path}` to the new file; increment `{seq}`. Parse usage from the coder's {tool:Task} result (see "Usage capture" in SKILL.md). Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "coder_fix_completed", iteration: {N}, tokens: {tokens}, toolUses: {toolUses}, durationMs: {durationMs} } }`. Call `register_artifact` for the coder's change-summary artifact.

### Selective re-review

After the coder fix cycle, call MCP tool `get_run_state` with `{ runDir: {run-dir} }`. Use the returned state to read per-reviewer criticality and determine which reviewers need re-review.

Examine the coder's change summary to determine which reviewers' findings the coder addressed. Only re-dispatch reviewers whose findings the coder acted on; skip reviewers whose findings were already `none` or whose findings were deferred. Re-review is warranted whenever the coder acted on findings from one or more reviewers; the scope of re-review is limited to those reviewers.

Before dispatching re-review: Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "re_review_dispatched", reviewers: ["{name}", ...] } }`.

If re-review is warranted, assign new `{NN}` values for each re-dispatched reviewer (same sequencing rules as initial dispatch; only activated reviewers consume sequence numbers). Update the named path variables (`{core-review-path}`, `{sf-review-path}`, `{test-review-path}`, `{code-review-path}`) to point to the new artifact files. Old review files are preserved on disk.

Recompute `{changed-files}` (a coder fix cycle may have added or removed files) and re-run the reviewer-context assembly steps to produce a fresh `{reviewer-context}`. The re-review prompts use the freshly computed value; do not reuse the value captured at initial dispatch time. `{reviewer-context-sidecar-path}` does not need to be re-resolved here: Fix-cycle coder prompts do not supply a sidecar path, so no new sidecar can appear during a Phase 4 fix cycle.

Send re-review {tool:Task} calls in a single message (parallel) using the same prompts, models, and turn budgets as the initial dispatch but adding context:

> {Same prompt as initial dispatch (including the conditional `## Reviewer context` block from "Reviewer-context assembly"), with this addition:}
>
> This is a re-review after fixes were applied. Previous findings: {summary of this reviewer's original findings}. Coder's change summary: Read {change-summary-path}. Focus on verifying fixes and checking for regressions, not repeating previously resolved issues.

If a re-reviewer fails or times out, treat its original findings as unverified and include them in the aggregated criticality at their original severity. Emit `reviewer_completed` with `status: "failed"` for that reviewer.

After the parallel re-dispatch returns and before parsing usage, apply the "Retry-on-interruption hook" (see above) per re-reviewer. Re-reviews are subject to the hook on the same terms as initial dispatches.

After re-reviews complete: Parse usage from each re-reviewer's {tool:Task} result (see "Usage capture" in SKILL.md). Aggregate usage across all re-review {tool:Task} results by summing `tokens`, `toolUses`, and `durationMs` independently. Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "re_review_completed", criticalities: { "{name}": "{level}", ... }, tokens: {summed-tokens}, toolUses: {summed-toolUses}, durationMs: {summed-durationMs} } }`. Call `register_artifact` for each re-reviewer's artifact file.

Aggregate findings again using the same rules. If the re-review produces new actionable findings and review rounds remain (< N), loop back: Run another coder fix cycle, then selective re-review. Repeat until convergence (aggregated criticality is `none`, or below both thresholds, or below approval_threshold with no remaining budget) or the iteration budget is exhausted.

### Loop termination

Call MCP tool `get_run_state` with `{ runDir: {run-dir} }`. Use the returned `reviewRoundsUsed` from state rather than relying on conversation-tracked iteration count.

- After N iterations unresolved (where N is the configured `max-review-rounds`): Exit with `needs_manual_review` status. The iteration count includes the initial review dispatch as round 1 and each selective re-review as an additional round. With N=1, only the initial review dispatch runs; if findings exist, the phase exits as `needs_manual_review` with no fix attempt. Set N >= 2 for effective iterative review.
- Structural issues: May return to Planning once per run.

At phase completion (converged or `needs_manual_review`): Compute aggregate usage for the entire review phase by summing `tokens`, `toolUses`, and `durationMs` across all {tool:Task} calls within Phase 4 (all reviewer dispatches, coder fix cycles, and re-reviews). Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_completed", phase: "review", status: "completed"|"failed"|"needs_manual_review", tokens: {aggregate-tokens}, toolUses: {aggregate-toolUses}, durationMs: {aggregate-durationMs}, data: { aggregatedCriticality: "{level}", reviewRoundsUsed: {N} } } }`. Then emit `phase_decision` for `parallelReview`:

```
Call MCP tool emit_event with:
  runDir: {run-dir}
  event: { event: "phase_decision", phase: "parallelReview", run: true,
           reason: "executed" }
```

## Phase 4a: Code simplification review

After Phase 4 converges (aggregated criticality is below both thresholds, or after fix cycles reduce criticality below the approval threshold, or when the review budget is exhausted with remaining findings below the approval threshold), run code-simplification-reviewer as a sequential final pass. The code-simplification-reviewer operates on code that has passed all reviews: Its purpose is polish, not correctness. Skip Phase 4a if Phase 4 exited with `needs_manual_review`. Code-simplification-reviewer failure should be recorded via `emit_event` but should NOT block progression to Phase 4b or fail the run.

Before dispatching code-simplification-reviewer, recompute the changed-file list: `git diff --name-only {merge-base-sha}..HEAD`. Store as `{changed-files}` (replaces the value computed at Phase 4 start, which may be stale after fix cycles). Then re-run the reviewer-context assembly steps to produce a fresh `{reviewer-context}`. `{reviewer-context-sidecar-path}` does not need to be re-resolved: Fix-cycle coder prompts do not supply a sidecar path, so the value from the Phase 4 dispatch remains current.

Emit `phase_decision` for `codeSimplifier` before Phase 4a executes:

```
Call MCP tool emit_event with:
  runDir: {run-dir}
  event: { event: "phase_decision", phase: "codeSimplifier", run: true|false,
           reason: "{executed or skipped reason}" }
```

If Phase 4a will run: Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_started", phase: "simplifier" } }`.

If Phase 4a is skipped: Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_completed", phase: "simplifier", status: "skipped" } }`.

Call {tool:Task} with `subagent_type: code-simplification-reviewer`, `max_turns: 30`, `model: {models.code_simplification_reviewer}`:

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
> Write your findings to: `{run-dir}/{NN}_code-simplification-reviewer_code-simplification-review.md`
>
> {If `{reviewer-context}` is non-empty, append: `## Reviewer context\n\n{reviewer-context}` (see "Reviewer-context assembly" above). Omit when empty.}

After: Store the full path as `{simplifier-review-path}`; increment `{seq}`. Apply the "Retry-on-interruption hook" (see above). The simplifier uses the same `### Criticality: (pending)` sentinel as the other reviewers; any partial artifact triggers one constrained retry before findings are read. Then read the findings file. Code-simplification-reviewer findings are NOT re-reviewed by other agents. If the code-simplification-reviewer produced actionable findings, run one coder fix cycle. If the coder fix cycle fails, emit `phase_completed` with `status: "failed"` and proceed to Phase 4b.

Call {tool:Task} with `subagent_type: orchestrated-coder`, `max_turns: 150`, `model: {models.coder}`:

> Address the code simplification findings for the following task.
>
> Task description: {task}
>
> Code-simplifier findings: Read `{simplifier-review-path}`
>
> These are polish changes: The code has already passed all reviews. Apply simplifications that clearly improve readability without changing behavior.
>
> Write your response to: `{run-dir}/{NN}_coder_change-summary.md`

After: If a coder fix cycle ran, update `{change-summary-path}` to the new file; increment `{seq}`. Compute aggregate usage for the simplifier phase by summing `tokens`, `toolUses`, and `durationMs` across all {tool:Task} calls within Phase 4a (the code-simplification-reviewer dispatch and, if applicable, the coder fix cycle). Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_completed", phase: "simplifier", status: "completed", tokens: {aggregate-tokens}, toolUses: {aggregate-toolUses}, durationMs: {aggregate-durationMs}, data: { actionableFindings: true|false, coderFixCycleRan: true|false } } }` (or `status: "failed"` on failure; include usage fields on failure events too when available). Call `register_artifact` for the code-simplification-reviewer review artifact. If a coder fix cycle ran, also call `register_artifact` for the coder change-summary artifact.

## Phase 4b: Final comprehensive review

After the parallel review and code-simplification-reviewer complete, perform one additional review with a clean context. This is NOT part of the parallel review. Skip Phase 4b if Phase 4 exited with unresolved findings (`needs_manual_review`); in that case Phase 4a was also skipped; under the parallel review structure, `needs_manual_review` is the only non-converged exit path, so no other skip condition is needed. If Phase 4 converged, always run Phase 4b (whether or not Phase 4a produced findings).

The initial Phase 4b review always runs regardless of remaining budget. Phase 4b shares the review-round budget with Phase 4 only for subsequent fix-and-re-review cycles: Rounds consumed in Phase 4 reduce the budget available for those cycles.

Call MCP tool `get_run_state` with `{ runDir: {run-dir} }`. Use the returned state to confirm whether Phase 4 exited `needs_manual_review` (which would skip Phase 4b) or converged.

Emit `phase_decision` for `holisticReview` before Phase 4b executes:

```
Call MCP tool emit_event with:
  runDir: {run-dir}
  event: { event: "phase_decision", phase: "holisticReview", run: true|false,
           reason: "{executed or skipped reason}" }
```

If Phase 4b will run: Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_started", phase: "holistic" } }`. Recompute `{changed-files}` (`git diff --name-only {merge-base-sha}..HEAD`) and re-run the reviewer-context assembly steps to produce a fresh `{reviewer-context}` for this dispatch. `{reviewer-context-sidecar-path}` does not need to be re-resolved: Only the implementation phase coder supplies a sidecar, so the value from the Phase 4 dispatch remains current.

If Phase 4b is skipped: Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_completed", phase: "holistic", status: "skipped" } }`. Set `{review-status}` to `needs_manual_review` and exit the module.

Call {tool:Task} with `subagent_type: orchestrated-reviewer`, `max_turns: 60`, `model: {models.holistic_reviewer}`:

> Perform a final review of all changes on this branch.
>
> Task description: {task}
>
> {If `{ticket-requirements-path}` is non-empty: Ticket requirements: Read `{ticket-requirements-path}`}
>
> This is a holistic assessment. Evaluate the branch as a whole, not individual lines or functions.
>
> Focus on:
>
> - Objective alignment: Do the changes accomplish the stated task? Is anything missing? Are there changes that don't serve the objective?
> - Integration risk: Could these changes break existing behavior? Test interactions between changed and unchanged code with concrete scenarios.
> - Completeness: Trace task requirements to implementation. Is every requirement addressed?
> - Unintended consequences: What could go wrong at system boundaries? Second-order effects?
>
> Use `git diff {merge-base-sha}..HEAD` to see all branch changes.
>
> Write your review to: `{run-dir}/{NN}_reviewer_holistic-review.md`
>
> {If `{reviewer-context}` is non-empty, append: `## Reviewer context\n\n{reviewer-context}` (see "Reviewer-context assembly" above). Omit when empty.}

Store the full path as `{holistic-review-path}`; increment `{seq}`. Apply the "Retry-on-interruption hook" (see above) before flow-control parsing. The retry of an initial Phase 4b dispatch is exempt from Phase 4b's "shares budget for re-review cycles" rule; the initial dispatch and its retry always run regardless of remaining `reviewRoundsUsed`. Call `register_artifact` for the holistic review artifact.

### Flow control

Extract `Criticality` using {tool:Task} return parsing (see SKILL.md).

Call MCP tool `get_run_state` with `{ runDir: {run-dir} }`. Use the returned state to read total `reviewRoundsUsed` across Phase 4 and 4b combined for the budget decision below.

- **criticality >= approval_threshold** AND review rounds remain: Delegate fixes to coder, then re-review using remaining budget; apply the same threshold-based flow-control rules as Phase 4. If the budget is exhausted without resolution, set `{review-status}` to `needs_manual_review`.
- **criticality >= approval_threshold** AND no review rounds remain: Delegate one coder fix round (no re-review), then set `{review-status}` to `converged`. These findings warranted a fix attempt but do not justify blocking approval when the budget is exhausted; the holistic review is a final sanity check, not a gating review.
- **criticality >= budget_threshold** (but below approval_threshold) AND review rounds remain: Delegate fixes to coder, then re-review using remaining budget (opportunistic).
- **criticality >= budget_threshold** (but below approval_threshold) AND no review rounds remain: Set `{review-status}` to `converged` (findings do not block approval).
- **criticality < budget_threshold**: Set `{review-status}` to `converged` (report only). This includes `none`, where reviewers produced no authored findings.

When a Phase 4b re-review runs, recompute the reviewer-context block before re-dispatching (re-run the assembly steps to produce a fresh `{reviewer-context}`). `{reviewer-context-sidecar-path}` does not need to be re-resolved: Fix-cycle coder prompts do not supply a sidecar path, so no new sidecar can appear. The re-review prompt uses the same conditional `## Reviewer context` block as the initial Phase 4b dispatch. Apply the "Retry-on-interruption hook" (see above) after the re-review returns; re-reviews are subject to the hook on the same terms as initial dispatches.

After: Compute aggregate usage for the holistic phase by summing `tokens`, `toolUses`, and `durationMs` across all {tool:Task} calls within Phase 4b (the holistic reviewer dispatch and, if applicable, coder fix and re-review cycles). Call MCP tool `emit_event` with `{ runDir: {run-dir}, event: { event: "phase_completed", phase: "holistic", status: "completed"|"needs_manual_review", tokens: {aggregate-tokens}, toolUses: {aggregate-toolUses}, durationMs: {aggregate-durationMs}, data: { criticality: "{level}" } } }`. Call `register_artifact` for any coder change-summary artifacts produced during Phase 4b fix cycles.
