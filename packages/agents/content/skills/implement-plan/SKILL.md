---
name: implement-plan
description: Implement a feature plan's tasks in order against the ticket's acceptance criteria
user-invocable: true
dependencies:
  skills:
    - emit-event
---

# Implement plan

Implement the work a feature plan describes. This skill is the canonical path for implementing a plan: It governs the phase the same way whether the plan was produced moments ago in this conversation or handed to a fresh session on another harness, because it re-resolves everything it needs from the environment rather than relying on conversation history.

## Arguments

| Flag                | Effect                                                                                                     | Default                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------- |
| `--plan=<path>`     | The plan artifact to implement.                                                                            | Auto-resolved (see below) |
| `--ticket=<source>` | The ticket the plan serves. Resolved per [ticket source resolution](../_data/ticket-source-resolution.md). | Auto-resolved (see below) |

## Scope

This skill implements a feature plan — the `## Tasks` / `## Verification` shape the plan template defines. A spike plan carries `## Investigation steps` and a `## Deliverable` instead (see [spike conventions](../_data/spike-conventions.md)): It is carried out to produce findings rather than implemented to produce a diff, and none of the steps below read its shape. Step 4 turns one away.

## The contract

The ticket's acceptance criteria are the contract; the plan is the mechanism by which they are met. When the plan and the facts on the ground disagree, the acceptance criteria decide — a plan step that no longer serves them is the thing that gives way.

The plan artifact is read-only. It is a record of what was decided at plan time, and a later reader compares it against the diff to see how implementation departed from it. Never edit it to match what was built: Progress is carried by lifecycle events and by the commits themselves.

## Process

1. **Get context**: Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash. The bundle emits the session-context manifest JSON to stdout; extract `default_branch`, `ticket_id`, `ticket_ref`, `ticket_url`, `scm`, `project_slug`, and `artifact_base_dir` from it. Then emit `skill.started` (payload `{"skill":"implement-plan"}`) per [Lifecycle events](#lifecycle-events).

2. **Resolve the plan** — stop at the first source that yields one:
   - **Explicit `--plan=<path>`**: Read it.
   - **Already in context**: This session produced or read the plan. Use it as-is; do not re-read the file.
   - **Newest plan for the ticket**: The newest of `*_plan.md` and `*_plan-v*.md` under `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/` (run subdirectories included), by the greatest `YYYYMMDD-HHMMSSZ` filename prefix. Both forms carry that prefix, so they sort chronologically together and the lexicographically greatest is the newest across the two. `refine-plan` writes its revision as `_plan-v2.md` under a later prefix than the plan it revises, so matching both forms is what lets a refined plan win over the original it supersedes. Do not widen to `*_plan*.md`, which also matches the `_plan-review.md` artifact written beside the revision.
   - **Ask**: No plan is resolvable. Ask the user for a path rather than implementing from the ticket alone — a caller who invoked this skill has a plan in mind.

   Announce the resolved path and its timestamp before executing anything. Several plans can exist for one ticket, and the newest is not always the intended one: This announcement is how the user catches a superseded plan while the choice is still free. It is not ceremony, and it is not skippable when the resolution was unambiguous.

3. **Resolve the ticket** — stop at the first source that yields one:
   - **Explicit `--ticket=<source>`**: Resolve per [ticket source resolution](../_data/ticket-source-resolution.md).
   - **Already in context**: This session already resolved the ticket. Use it as-is.
   - **Stored URL**: `ticket_url` from step 1, fetched per [Stored ticket URL](../_data/ticket-source-resolution.md#stored-ticket-url).
   - **Plan provenance**: The plan's frontmatter `ticket_ref` / `ticket_id`, resolved per [auto-resolve](../_data/ticket-source-resolution.md#auto-resolve).
   - **No ticket**: Every source failed — the plan was produced from a free-form description, or the ticket is unreachable. Announce that no ticket governs the run and execute against the plan as the sole contract. Do not stall on a missing ticket; do not silently substitute the plan for one without saying so.

4. **Read the plan and the ticket** in full before touching code, including the plan's `## Risks` section — it names where the plan expects to need adaptation.

   Check the shape as you read: A plan carrying `## Investigation steps` rather than `## Tasks` is a spike, which this skill does not implement (see [Scope](#scope)). Emit `skill.completed` (payload `{"outcome":"stopped: spike plan"}`) per [Lifecycle events](#lifecycle-events), then stop and tell the user the plan is a spike, to be carried out directly rather than implemented here.

5. **Execute the tasks in plan order.** Each task is done when its own acceptance criteria are met, not when its files have been touched. Task order encodes dependencies; do not reorder for convenience. Comments you write along the way take the [Comment discipline](#comment-discipline) audit.

   Raise material divergence to the user before proceeding, rather than rerouting silently. **Material** means the plan's approach no longer fits what the code turns out to be: A named file or symbol does not exist, a task's premise is false, or meeting the acceptance criteria requires an approach the plan did not consider. Adapting details within the plan's approach (a different helper name, an extra test case, a step that turns out unnecessary because the code already does it) is ordinary implementation — carry on and note it in the closing summary.

   Commit each task's work as its own commit, composing the message with the `{skill:commit}` skill. Work that does not stand on its own (a scaffold a later task fills in) rides with the task that completes it. Everything the closing menu offers reads committed history, so work left uncommitted is work the next step cannot see.

6. **Audit the diff** per [Diff audit](#diff-audit). The audit runs over the work of every task, ahead of the gates, so a repair it forces is itself covered by them. A repair made once the tasks are committed, whether the audit forces it or a gate does, is committed the same way: amended into the commit it corrects, or riding its own, composed with the `{skill:commit}` skill.

7. **Run the plan's verification gates.** Execute the `## Verification` section's checks and report the actual results. A gate that fails is not done: Fix the cause, or report the failure. Never claim a gate passed without having seen it pass.

8. **Report completion.** Summarize what was built against the ticket's acceptance criteria, naming any criterion left unmet and any divergence from the plan. Every sentence of that summary is read back from the diff per [Diff audit](#diff-audit), a criterion reported unmet as much as one reported met. Then emit `skill.completed` (payload `{"outcome":"plan-implemented"}`) per [Lifecycle events](#lifecycle-events).

9. **Present next steps** following [next-steps options](#next-steps-options). As you present the menu, emit `input.requested` (payload `{"prompt":"next-steps"}`) per [Lifecycle events](#lifecycle-events).

<!-- include: ../../_partials/comment-discipline.md / -->

<!-- include: ../../_partials/diff-audit-checklist.md / -->

<!-- guidance-hook: implementation-preferences -->

## Next-steps options

### Options

| #   | Emoji | Option                   | Description                                            |
| --- | ----- | ------------------------ | ------------------------------------------------------ |
| 1   | 🔍    | Review branch            | Run a single end-of-work review pass over the branch   |
| 2   | 🎶    | Orchestrated review      | Run the full orchestrated review cycle over the branch |
| 3   | 🚢    | Create PR without review | Open the PR straight from the implementation           |

### Output format

Present all three options as a numbered list per [option format](#option-format). Each option carries a strength marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option earns the strongest marker. Pros and cons are omitted by default — add a `➕` or `➖` line only when the realized diff presents a context-specific tradeoff bearing on which option fits (e.g., "the shared schema changed, so consumers outside this package are affected"). Generic option properties ("structured review pass," "longer wall time") are noise and must be omitted. Include the ticket path in each skill-invoking option line; omit it when no ticket governed the run.

Options that invoke a review include context-clearing guidance:

- **Review branch** and **Orchestrated review**: Prepend "Clear context and use..." — a reviewer that watched the code being written inherits the author's blind spots, and orchestration dispatches fresh subagents regardless.
- **Create PR without review**: No "Clear context" prefix; the PR description is composed from this session's work. `create-pr` requires the branch to be in sync with its remote and stops when it is not, so note on the option that it needs the branch pushed first.

Example (rendered for the default case, where the recommendation rules below select Review branch):

```
Next steps:
1. 🔍 ■■□ Review branch:
   - Clear context and use the `review-branch` skill with ticket: {ticket_source}
2. 🎶 ■□□ Orchestrated review:
   - Clear context and use the `orchestrate-review` skill with ticket: {ticket_source}
3. 🚢 ■□□ Create PR without review:
   - Use the `create-pr` skill
```

Skill names for each option:

- 🔍 **Review branch** -> `review-branch`
- 🎶 **Orchestrated review** -> `orchestrate-review`
- 🚢 **Create PR without review** -> `create-pr`

### Recommendation rules

Select the recommended option by checking these rules in order and stopping at the first match. Judge the diff you actually produced, not the work the plan predicted: A plan-time estimate of how much review the work would need was made before anyone knew what the code would look like, and this menu is where that estimate is corrected.

1. **Create PR without review** — the realized diff is trivial enough that a review pass would catch nothing meaningful ([complexity levels 1–2](../_data/complexity-classification.md)): a mechanical rename, a typo fix, a single-file change with no behavioral surface.
2. **Orchestrated review** — the realized diff turned out cross-cutting ([complexity level 4](../_data/complexity-classification.md)): It spans packages or module boundaries, changes a shared contract, or has consequences that ripple past the change sites. Parallel aspect reviewers cover a surface a single pass would thin out.
3. **Review branch** — all other cases (default).

#### Marker strengths

The selected option carries the ■■□ marker in the rendered output. The other two options carry ■□□ by default. Reserve □□□ for an alternative with a clear drawback in the current context. Reserve ■■■ for the selected option only when you would actively push back against any other choice.

<!-- include: ../_partials/option-format.md / -->

<!-- include: ../_partials/lifecycle-events.md / -->
