# Governor commands design

## Overview

The governor concept (from the [session summary](SESSION-SUMMARY.md)) reframes the developer from passive observer to active commander: "the governor doesn't just watch, they command." This document designs five commands that transform the Factory visualization from a monitor into a control interface.

### The critical constraint: subagent autonomy

The orchestration engine runs on Claude Code's Task tool. Subagents are dispatched as autonomous units: once a Task call is made, the orchestrator cannot:

- **Send messages to a running subagent.** There is no side-channel. The Task tool is fire-and-forget until it returns.
- **Pause or resume a subagent.** There is no suspend/resume primitive.
- **Cancel a running subagent.** Once dispatched, a Task runs until completion, failure, or `maxTurns` exhaustion.

This means all governor commands must work _around_ running subagents, not _through_ them. The only points where the orchestrator can act are **between** subagent dispatches — at phase boundaries and flow-control decision points. The orchestrator reads state, makes decisions, and dispatches the next Task. Governor commands influence those decisions by modifying the shared state (event log, run-index.json) that the orchestrator reads.

### Architecture: who receives the command?

The Factory server is a read-only visualization layer today. Governor commands require it to become a write path: the frontend sends commands to the Factory server, which writes events into the run's event log (`run-log.jsonl`). The orchestrator's existing `get_run_state` calls then pick up those events and adjust behavior accordingly.

This "write to shared state, read at decision points" pattern is the only feasible approach given the constraints above. It works like a message board: the governor posts instructions, and the orchestrator reads them at its next decision point.

## Feasibility matrix

| Command                      | Feasibility                     | Complexity | Dependencies                             |
| ---------------------------- | ------------------------------- | ---------- | ---------------------------------------- |
| Cancel run                   | :white_check_mark: Feasible now | Low        | New event type, Factory write endpoint   |
| Schedule additional review   | :wrench: Needs minor changes    | Medium     | New event type, orchestrator state check |
| Add comment / course-correct | :construction: Aspirational     | High       | Fundamental Task tool changes            |
| Prioritize run               | :wrench: Needs minor changes    | Medium     | Multi-run scheduler, resource model      |
| Retry failed phase           | :wrench: Needs minor changes    | Medium     | New event type, orchestrator retry logic |

## Command 1: Cancel run

### User experience

**Trigger:** A red "Cancel run" button in the status bar, visible only when `status === 'in_progress'`. Also available as a keyboard shortcut (`Ctrl+Shift+C` / `Cmd+Shift+C`). The button requires a confirmation dialog: "Cancel this run? Any running agents will complete their current work, but no new phases will start."

**Visual feedback:** On confirmation, the facility's lighting dims. The status bar transitions to "Cancelling..." with a pulsing amber indicator. When the orchestrator acknowledges (its next `get_run_state` call picks up the cancellation), the status transitions to "Cancelled" and agents at their stations play idle/concerned animations. Any agent that was mid-work when the cancel was posted finishes and fades out.

### API design

```typescript
// POST /api/runs/:projectSlug/:runId/cancel

// Request body
interface CancelRunRequest {
  reason?: string; // Optional human-readable reason
}

// Response body (202 Accepted)
interface CancelRunResponse {
  acknowledged: true;
  eventId: string; // The timestamp of the emitted event
}

// Error responses
// 404: Run not found
// 409: Run already completed/failed/cancelled
```

The `202 Accepted` status communicates that the cancellation has been _recorded_ but not yet _effected_ — the orchestrator will pick it up at its next decision point.

### Server implementation

1. Factory server validates the run exists and is `in_progress`.
2. Factory server appends a `governor_cancel_requested` event to `run-log.jsonl`.
3. The orchestrator's existing flow reads `get_run_state` between phases. The event folder must recognize the new event and set a `cancelRequested` flag on `CanonicalRunStatus`.
4. At the next phase boundary, the orchestrator checks `cancelRequested`. If true, it skips remaining phases, emits a `run_failed` event with `reason: "cancelled_by_governor"`, and calls `complete_run`.
5. Any currently running subagent completes its work (we cannot stop it), but the orchestrator does not dispatch further Tasks.

### Constraints and limitations

- **Cannot stop a running subagent.** If the coder is mid-implementation when cancel is requested, it will finish its current Task invocation. The orchestrator simply will not dispatch the next phase.
- **Timing window.** If the cancel is posted during the last phase's execution, the run may complete normally before the orchestrator reads the cancel flag. The cancel event remains in the log for audit purposes.
- **Idempotent.** Multiple cancel requests are harmless — the first one sets the flag, subsequent ones are no-ops.

**Feasibility: :white_check_mark: Feasible now.** This requires only a new event type, an event-folder update, and a Factory write endpoint. The orchestrator's between-phase `get_run_state` calls already provide the hook point. The only "orchestrator change" is a state check at the top of phase dispatch logic.

### Event log changes

New event type:

```typescript
interface GovernorCancelRequestedEvent {
  t: string;
  event: 'governor_cancel_requested';
  reason?: string;
}
```

New field on `CanonicalRunStatus`:

```typescript
cancelRequested?: boolean; // Set by event folder when governor_cancel_requested is seen
```

The `foldEvents` function adds a case for `governor_cancel_requested` that sets `state.cancelRequested = true`.

When the orchestrator acts on the cancel, it emits a standard `run_failed` event with `status: 'failed'` and `reason: 'cancelled_by_governor'`. No new event type is needed for the completion side.

## Command 2: Schedule additional review

### User experience

**Trigger:** A "Request review" button in the run detail panel, visible when the run is in the review phase or has completed the review phase. Also available as a context menu item on the review station in the visualization. Clicking opens a small form: "Schedule additional review round" with an optional text field for focus instructions (e.g., "Pay extra attention to the error handling in `parser.ts`").

**Visual feedback:** On submission, a new reviewer character appears at the entrance of the facility and walks toward the review station. A thought bubble shows "Queued" until the review actually starts. If the review is currently in progress, the reviewer waits visibly.

### API design

```typescript
// POST /api/runs/:projectSlug/:runId/schedule-review

// Request body
interface ScheduleReviewRequest {
  focus?: string; // Optional focus instructions for the reviewer
}

// Response body (202 Accepted)
interface ScheduleReviewResponse {
  acknowledged: true;
  eventId: string;
}

// Error responses
// 404: Run not found
// 409: Run already completed/failed
// 409: Run has not reached the review phase
```

### Server implementation

1. Factory server validates the run exists and is `in_progress`.
2. Factory server appends a `governor_review_requested` event to `run-log.jsonl`.
3. The orchestrator reads this via `get_run_state` at its next decision point (typically during review-cycle flow control).
4. Two scenarios:
   - **Review cycle still in progress:** The orchestrator's loop termination check sees `additionalReviewRequested` and adjusts the effective `maxReviewRounds` upward by 1. This means if the review was about to terminate due to budget exhaustion, it gets one more round.
   - **Review cycle already completed, but run still in progress (e.g., during summary phase):** The orchestrator cannot rewind. The additional review is recorded in the run summary as "governor requested additional review after review phase completed — not executed." This is an honest limitation.

### Constraints and limitations

- **Only effective during or before the review cycle.** Once the review phase has completed and the orchestrator has moved past it, there is no mechanism to re-enter the review module. The orchestrator processes phases linearly.
- **Cannot interrupt a running reviewer.** If reviewers are currently dispatched, the additional round happens after they complete, not in parallel with them.
- **Focus instructions are advisory.** The `focus` field would need to be injected into the reviewer's Task prompt. This requires the orchestrator to read governor events and incorporate them into prompt construction — a minor change to the review-cycle module.
- **Budget interaction.** The additional round increases `maxReviewRounds` by 1 from the governor's request point. If the existing budget was exhausted, this grants exactly one more iteration.

**Feasibility: :wrench: Needs minor changes.** The review-cycle module's loop termination logic needs to check for `additionalReviewRequested` in the run state. The event folder needs a new case. The orchestrator's prompt construction needs to conditionally include focus instructions. All achievable without architectural changes.

### Event log changes

New event type:

```typescript
interface GovernorReviewRequestedEvent {
  t: string;
  event: 'governor_review_requested';
  focus?: string;
}
```

New fields on `CanonicalRunStatus`:

```typescript
governorReviewRequested?: boolean;
governorReviewFocus?: string;
```

The orchestrator clears these flags after acting on them (by emitting a `governor_review_acknowledged` event).

Additional event type for acknowledgment:

```typescript
interface GovernorReviewAcknowledgedEvent {
  t: string;
  event: 'governor_review_acknowledged';
}
```

## Command 3: Add comment / course-correct

### User experience

**Trigger:** A "Send message" button on any active agent in the visualization. Clicking opens a text input: "Message to [agent role]". The governor types a message (e.g., "Use the existing `validateInput` utility instead of writing a new one"). Pressing Enter sends it.

**Visual feedback:** An envelope icon animates from the governor's position to the agent's station. The agent's thought bubble briefly shows "Message received" before returning to work. If the agent cannot receive messages (it is already running), the envelope sits in the agent's inbox tray with a tooltip explaining it will be delivered at the next opportunity.

### API design

```typescript
// POST /api/runs/:projectSlug/:runId/comment

// Request body
interface AddCommentRequest {
  targetPhase: string; // Which phase the comment is directed at
  targetAgent?: string; // Specific agent (e.g., 'orchestrated-coder')
  message: string; // The governor's message
}

// Response body (202 Accepted)
interface AddCommentResponse {
  acknowledged: true;
  eventId: string;
  deliveryExpectation: 'next_dispatch' | 'cannot_deliver';
}

// Error responses
// 404: Run not found
// 409: Run already completed
```

### Server implementation

1. Factory server appends a `governor_comment` event to `run-log.jsonl`.
2. The orchestrator reads it via `get_run_state` at its next decision point.
3. **If the target phase has not yet started:** The comment is prepended to the Task prompt for that phase's subagent. For example, a comment targeting `implementation` with "Use the existing `validateInput` utility" becomes an additional instruction in the coder's prompt.
4. **If the target phase is currently running:** The comment cannot be delivered. It is recorded in the run summary as "governor comment received during active phase — not delivered."
5. **If the target phase has already completed:** The comment is recorded in the run summary as context. If a fix cycle or re-review is upcoming, the comment may be incorporated into that prompt.

### Constraints and limitations

- **Cannot deliver to a running subagent.** This is the fundamental constraint. The Task tool provides no side-channel. A message sent while the coder is actively working cannot reach it until the coder completes and a new Task is dispatched.
- **Prompt injection concerns.** Governor messages are injected into subagent prompts. They should be clearly delimited (e.g., wrapped in a `## Governor instructions` section) and the subagent should treat them as high-priority context, not as overriding the original task.
- **Timing sensitivity.** The window between "phase not yet started" and "phase already running" is narrow during fast runs. By the time the governor types a message, the phase may have already been dispatched.
- **No guaranteed delivery.** Unlike the other commands, this one has a high probability of arriving too late to be useful in fast-moving runs. It is most useful during long review cycles where the governor can inject instructions before the next coder fix dispatch.

**Feasibility: :construction: Aspirational.** While writing the event is trivial, making it _useful_ requires changes at multiple levels: the orchestrator must check for pending comments before every Task dispatch, prompts must be modified dynamically, and there is no way to deliver a message to an active subagent. The core value proposition — mid-flight course correction — is fundamentally limited by the Task tool's fire-and-forget model. Delivering comments to _future_ dispatches is feasible with minor changes; delivering them to _active_ agents requires fundamental changes to how subagents work (e.g., a shared scratchpad that agents poll, or a streaming message channel).

### Event log changes

New event type:

```typescript
interface GovernorCommentEvent {
  t: string;
  event: 'governor_comment';
  targetPhase: string;
  targetAgent?: string;
  message: string;
  delivered?: boolean; // Stamped by orchestrator when it acts on the comment
}
```

New field on `CanonicalRunStatus`:

```typescript
pendingGovernorComments?: GovernorComment[];
```

```typescript
interface GovernorComment {
  message: string;
  targetPhase: string;
  targetAgent?: string;
  timestamp: string;
  delivered: boolean;
}
```

## Command 4: Prioritize run

### User experience

**Trigger:** In a multi-run view (when the governor is overseeing several concurrent orchestrations), each run has a priority indicator. Clicking it opens a priority selector: "Normal", "High", "Critical". Alternatively, a drag-and-drop reordering in a run queue panel.

**Visual feedback:** Prioritized runs glow brighter. In the empire view (vision F), the prioritized facility's lights are brighter and its agents move faster. Low-priority runs dim slightly. A "Priority: High" badge appears next to the run's title.

### API design

```typescript
// POST /api/runs/:projectSlug/:runId/prioritize

// Request body
interface PrioritizeRunRequest {
  priority: 'normal' | 'high' | 'critical';
}

// Response body (200 OK)
interface PrioritizeRunResponse {
  acknowledged: true;
  previousPriority: string;
  newPriority: string;
}

// Error responses
// 404: Run not found
// 409: Run already completed
```

Note: This uses `200 OK` rather than `202 Accepted` because priority is a metadata change that takes effect immediately on the visualization side, even if the orchestration side acts on it asynchronously.

### Server implementation

1. Factory server appends a `governor_priority_set` event to `run-log.jsonl`.
2. The visualization immediately reflects the priority change (the event is also stored in-memory for the Factory server's own state).
3. **Resource allocation (aspirational):** In a future multi-run scheduler, priority influences which run gets dispatched next when compute is constrained. Today, runs are independent processes — there is no central scheduler that allocates agent compute across runs.
4. **Model escalation (minor change):** Priority could influence model selection. A "critical" priority run could escalate certain agents from Sonnet to Opus. This requires the orchestrator to read governor priority events and adjust the `{models}` map. Achievable but requires careful design to avoid mid-run model inconsistency.

### Constraints and limitations

- **No central scheduler exists today.** Each orchestration run is an independent Claude Code session. There is no process that decides "run A gets compute before run B." Priority is meaningful only if such a scheduler is built.
- **Priority is advisory for the visualization.** Today, the only concrete effect is visual: the governor sees their prioritization reflected in the UI. This is still valuable for cognitive load management — knowing which run matters most — but it does not change execution order.
- **Model escalation is the most feasible immediate effect.** If the orchestrator reads `priority: 'critical'` from state, it could bump default models from Sonnet to Opus. This is a real resource-allocation effect achievable with minor changes.
- **Cost implications.** Higher-priority runs using more expensive models increase cost. The priority system should display estimated cost impact.

**Feasibility: :wrench: Needs minor changes (visual + model escalation) / :construction: Aspirational (true resource scheduling).** The visual priority indicator is trivially implementable. Model escalation requires the orchestrator to check for priority events. True multi-run scheduling requires a fundamentally new component.

### Event log changes

New event type:

```typescript
interface GovernorPrioritySetEvent {
  t: string;
  event: 'governor_priority_set';
  priority: 'normal' | 'high' | 'critical';
}
```

New field on `CanonicalRunStatus`:

```typescript
priority?: 'normal' | 'high' | 'critical'; // Defaults to 'normal' if unset
```

## Command 5: Retry failed phase

### User experience

**Trigger:** When a phase shows a "Failed" status (red indicator), a "Retry" button appears on that phase's station in the visualization. Also available as a keyboard shortcut when the failed phase is selected. Clicking opens a confirmation: "Retry [phase name]? This will re-dispatch the agent for this phase."

**Visual feedback:** The failed station's red indicator transitions to amber (retrying). A new agent walks to the station and begins working. The previous failed agent fades out with a "dismissed" animation.

### API design

```typescript
// POST /api/runs/:projectSlug/:runId/retry

// Request body
interface RetryPhaseRequest {
  phase: string; // The phase to retry (e.g., 'implementation', 'review')
}

// Response body (202 Accepted)
interface RetryPhaseResponse {
  acknowledged: true;
  eventId: string;
}

// Error responses
// 404: Run not found
// 400: Phase not found or not in failed state
// 409: Run already completed successfully
// 409: Run is currently in_progress (retry is for completed-as-failed runs)
```

### Server implementation

1. Factory server validates the run has a failed phase and the run's overall status is `failed`.
2. Factory server appends a `governor_retry_requested` event to `run-log.jsonl`.
3. The orchestrator is **not running** at this point (the run failed, so the orchestrator session ended). This is the key challenge: retry requires _restarting_ the orchestrator.
4. Two implementation paths:
   - **Path A (simpler): Manual re-invocation.** The Factory UI displays a prompt: "To retry, run this command in your terminal: `/orchestrate-dev --retry-from=implementation --run-dir={run-dir}`". The governor copies and pastes the command. The orchestrator skill reads the `--retry-from` flag, loads the existing run's context from `run-index.json`, and resumes from the failed phase.
   - **Path B (automated): Factory spawns a new Claude Code session.** The Factory server invokes `claude --skill orchestrate-dev --retry-from=implementation --run-dir={run-dir}` as a child process. This is more seamless but requires Factory to have permission to spawn Claude Code sessions and manage their lifecycle.

### Constraints and limitations

- **The orchestrator has exited.** Unlike cancel and schedule-review, which modify a live run, retry operates on a dead run. Writing events to `run-log.jsonl` alone is not sufficient — someone must read them and act.
- **Phase isolation is imperfect.** Retrying `implementation` after a failed implementation is straightforward — re-run the coder with the same plan. But retrying `review` requires the implementation artifacts to still be valid. If the coder's work was partially committed, the retry reviewer sees that partial state.
- **State continuity.** The retry should continue the existing run (same `runDir`, same `run-log.jsonl`) rather than creating a new run. This means appending new events to the existing log. The `run-index.json` status must transition from `failed` back to `in_progress`.
- **No retry of individual subagents within a phase.** If one of four parallel reviewers failed, retrying the review phase re-dispatches all reviewers, not just the failed one. Selective subagent retry would require tracking per-agent dispatch state more granularly.

**Feasibility: :wrench: Needs minor changes (Path A) / :construction: Aspirational (Path B).** Path A — displaying the retry command for the governor to run manually — is straightforward. The orchestrate skill needs a `--retry-from` flag that resumes from a given phase using an existing run directory. Path B — automated re-invocation — requires Factory to manage Claude Code process lifecycle, which is a significant new capability.

### Event log changes

New event types:

```typescript
interface GovernorRetryRequestedEvent {
  t: string;
  event: 'governor_retry_requested';
  phase: string;
}

interface RunResumedEvent {
  t: string;
  event: 'run_resumed';
  fromPhase: string;
  resumedBy: 'governor'; // Extensible for future automated retry
}
```

New field on `CanonicalRunStatus`:

```typescript
retryRequested?: {
  phase: string;
  timestamp: string;
};
```

Status transition: when the orchestrator resumes, it emits `run_resumed` and sets `status` back to `in_progress`. The `run_failed` event remains in the log for history. The event folder needs to handle the `failed -> in_progress` transition by recognizing `run_resumed` as a status reset.

## New event types

Consolidated list of all new event types required across the five commands:

| Event type                     | Purpose                                              | Schema additions                                                 |
| ------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------- |
| `governor_cancel_requested`    | Governor requests run cancellation                   | `reason?: string`                                                |
| `governor_review_requested`    | Governor requests additional review round            | `focus?: string`                                                 |
| `governor_review_acknowledged` | Orchestrator confirms it acted on the review request | (none)                                                           |
| `governor_comment`             | Governor sends a message to a phase/agent            | `targetPhase: string`, `targetAgent?: string`, `message: string` |
| `governor_priority_set`        | Governor sets run priority                           | `priority: 'normal' \| 'high' \| 'critical'`                     |
| `governor_retry_requested`     | Governor requests retry of a failed phase            | `phase: string`                                                  |
| `run_resumed`                  | Orchestrator resumes a previously failed run         | `fromPhase: string`, `resumedBy: string`                         |

All governor events share the `governor_` prefix for easy identification and filtering. They also share a common pattern: `t` (server-injected timestamp) + `event` (discriminator).

### Schema changes required

The `runEventSchema` discriminated union in `packages/run-core/src/schemas/run-log-schema.ts` needs new entries for each event type. The `RunEvent` type union in `packages/run-core/src/types/run-log.ts` needs corresponding interfaces. The `foldEvents` function in `packages/run-core/src/event-folder.ts` needs new cases in `applyEvent`.

The `CanonicalRunStatus` type in `packages/run-core/src/types/canonical.ts` needs new optional fields:

```typescript
export interface CanonicalRunStatus {
  // ... existing fields ...
  cancelRequested?: boolean;
  priority?: 'normal' | 'high' | 'critical';
  governorReviewRequested?: boolean;
  governorReviewFocus?: string;
  pendingGovernorComments?: GovernorComment[];
  retryRequested?: { phase: string; timestamp: string };
}
```

## API route summary

| Method | Path                                            | Description                     | Feasibility                     |
| ------ | ----------------------------------------------- | ------------------------------- | ------------------------------- |
| POST   | `/api/runs/:projectSlug/:runId/cancel`          | Cancel a running orchestration  | :white_check_mark: Feasible now |
| POST   | `/api/runs/:projectSlug/:runId/schedule-review` | Request additional review round | :wrench: Needs minor changes    |
| POST   | `/api/runs/:projectSlug/:runId/comment`         | Send message to phase/agent     | :construction: Aspirational     |
| POST   | `/api/runs/:projectSlug/:runId/prioritize`      | Set run priority                | :wrench: Needs minor changes    |
| POST   | `/api/runs/:projectSlug/:runId/retry`           | Retry a failed phase            | :wrench: Needs minor changes    |

All governor command endpoints follow the same pattern:

- Namespace: `/api/runs/:projectSlug/:runId/{command}`
- Method: `POST` (all are state-changing operations)
- Response: `202 Accepted` for deferred actions, `200 OK` for immediate effects
- Error pattern: `404` (not found), `409` (conflict — wrong state), `400` (bad request)

These would be added to the existing `createRunsRouter` in `packages/factory/src/server/routes/runs.ts`, which currently only has `GET` endpoints.

## Implementation priority

Recommended order, with quick wins first:

### Phase 1: Foundation (prerequisite for all commands)

1. **Factory write path.** Today the Factory server is read-only. Add the ability for Factory to append events to `run-log.jsonl`. This is a one-time infrastructure change that all commands depend on. Requires careful file-locking or append-only semantics to avoid race conditions with the MCP server, which is also writing to the same file.

2. **Event schema extension.** Add the `governor_` event types to the run-log schema and event folder. Even before any UI exists, this establishes the contract.

### Phase 2: Cancel run (:white_check_mark: quick win)

3. **Cancel run (server + event folder).** The simplest command with the highest value. Governors currently have no way to stop a runaway orchestration except killing the terminal process. Cancel gives them a clean shutdown path.

4. **Cancel run (UI).** Button in the status bar, confirmation dialog, visual feedback.

### Phase 3: Priority and retry

5. **Prioritize run (visual only).** Even without resource-allocation effects, letting the governor mark runs as high-priority helps them manage cognitive load across concurrent runs. This is purely a UI/metadata feature.

6. **Retry failed phase (Path A: manual).** Display the retry command for copy-paste. Low implementation cost, high value for recovering from failures without starting over.

### Phase 4: Review scheduling

7. **Schedule additional review.** Requires the orchestrator to check for governor events in the review-cycle module's loop termination logic. More complex than cancel but still within the existing architecture.

### Phase 5: Course correction (aspirational)

8. **Add comment / course-correct (pre-dispatch only).** Implement the subset that works: delivering comments to phases that have not yet started. This is useful during long planning phases or between review iterations.

9. **Add comment / course-correct (active delivery).** Requires fundamental changes to the Task tool or a new agent communication mechanism. This is a research project, not a feature request.

### Not prioritized

- **Prioritize run (resource scheduling).** Requires a multi-run scheduler that does not exist yet. Defer until multi-run orchestration is designed.
- **Retry (Path B: automated).** Requires Factory to spawn and manage Claude Code sessions. Defer until the process management layer is designed.
