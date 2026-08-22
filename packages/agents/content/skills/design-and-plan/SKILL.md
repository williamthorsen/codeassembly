---
name: design-and-plan
description: Interactive design exploration followed by ticket refinement and implementation planning
user-invocable: true
dependencies:
  skills:
    - emit-event
    - save-artifact
---

# Design and plan

Interactive design exploration followed by ticket refinement and implementation planning. Produces two artifacts: a refined ticket and an implementation plan.

**Announce at start:** "Using design-and-plan to explore requirements and produce a ticket + implementation plan."

## Arguments

- Task source (required): Issue URL, shorthand reference (`#99`, `issue 99`), file path, or description of what to build
- `--check-staleness` (optional): Always run the relevancy check, regardless of the heuristic
- `--skip-staleness` (optional): Never run the relevancy check, regardless of the heuristic

## Overview

Turn a task into a well-defined ticket and actionable implementation plan through collaborative dialogue. Explore requirements interactively, converge on a design, and produce two artifacts that together give a competent coder everything they need.

<HARD-GATE>
Do NOT generate the implementation plan until the design has been agreed upon and the ticket has been approved. This applies regardless of perceived simplicity.
</HARD-GATE>

<!-- guidance-hook: ticketing-preferences -->

## Process

**Narrate every ask.** Throughout the phases below, before presenting any ask to the user (a clarifying question, a design or ticket or plan approval, a drift-verdict decision, the closing next-steps menu), emit `input.requested` with a short label of the ask (e.g. payload `{"prompt":"tier selection"}`) per [Lifecycle events](#lifecycle-events), so a watching surface shows which question this session is waiting on. Compose the label fresh for each ask and keep it to a few words. Emit before presenting, in the same turn. Never at the end of the turn.

### Phase 1: Resolve task source and assess relevancy

1. **Resolve the task source** using the [ticket source resolution](../_data/ticket-source-resolution.md) table. Request the `updatedAt` field for use in the relevancy check. Store the resolved metadata for use in the relevancy check and Phase 6's optional remote update. When the source resolves to a URL, persist it to the branch manifest per [Stored ticket URL](../_data/ticket-source-resolution.md#stored-ticket-url) so a later session needs no ticket argument. Once the source is resolved, emit `skill.started` (payload `{"skill":"design-and-plan"}`) per [Lifecycle events](#lifecycle-events).

2. **Assess relevancy**: Determine whether the ticket may be stale and, if so, verify it is still relevant.

**Override arguments take precedence:**

- If `--check-staleness` was passed: Run the relevancy check immediately (no prompt).
- If `--skip-staleness` was passed: Skip the relevancy check entirely.
- If neither was passed: Evaluate the heuristic below.

**Heuristic** (evaluated only when the task source is a remote ticket with a last-updated date):

1. Retrieve the ticket's last-updated date from the resolved metadata (e.g., GitHub's `updatedAt` field).
2. Count commits since that date: `git rev-list --count --after="{last-updated date}" HEAD`
3. If the ticket was updated within the last 3 days _or_ fewer than 5 commits have been made since the last update, skip the relevancy check.
4. Otherwise, prompt the user: "This ticket may be out of date ({N} commits since the last update on {date}). Would you like me to check for staleness and relevancy?" If the user declines, continue into Phase 2.

If the task source is plain text or a file (no remote metadata), skip the relevancy check unless `--check-staleness` was explicitly passed.

**The relevancy check** (when triggered by user approval or `--check-staleness`):

Invoke the `{skill:assess-ticket}` skill with the resolved ticket source and mode `drift`.

**After the check**: Interpret the drift verdict:

- 🟢 `none`: Continue silently into Phase 2.
- 🟠 `partial` or 🔴 `severe`: Present the assessment findings to the user. Ask whether to proceed as-is, adjust the scope, or stop. If the user stops, emit `skill.completed` (payload `{"outcome":"stopped: ticket drift"}`) per [Lifecycle events](#lifecycle-events).

### Phase 2: Understand the task

1. **Explore project context:** Check relevant files, docs, recent commits to understand the affected area of the codebase.

2. **Evaluate the ticket on its merits**: Apply the criteria in [ticket evaluation](../_data/ticket-evaluation.md). When evaluation surfaces a divergence from the ticket as written, raise it to the user before forming questions or designing. Divergence includes scope that should grow: Work the problem requires folds into this change by default rather than a follow-up (see [scope-and-deferral](../_data/scope-and-deferral.md)).

3. **Ask clarifying questions**, one at a time:
   - Purpose and motivation
   - Constraints and scope boundaries
   - Success criteria and edge cases
   - Prefer multiple choice when possible
   - Only one question per message
   - When asking option-style questions, follow [option format](#option-format). (Reinforces the rule in `AGENTS.md`: intentional redundancy.)

**Important:** Do not use `{tool:AskUserQuestion}` or any interactive selector (pop-up, arrow-key, structured-choice) for multiple-choice questions. Ask the question as plain text in the message body, with options as a numbered list.

<!-- include: ../_partials/action-items.md / -->

### Phase 3: Converge on a design

1. **When the solution is obvious:** Present the recommended approach directly. Don't manufacture alternatives for the sake of it.
2. **When the solution is not obvious:** Propose 2-3 approaches with trade-offs. Lead with your recommendation and explain why. Rank options per [design priorities](../_data/design-priorities.md).
   - When asking option-style questions, follow [option format](#option-format). (Reinforces the rule in `AGENTS.md`: intentional redundancy.)
3. **Present the design** in sections scaled to complexity. Ask after each section whether it looks right.
4. **Get explicit approval** before proceeding.

### Phase 4: Refine the ticket

**Spike mode.** If this is a spike, use the spike ticket template in [spike conventions](../_data/spike-conventions.md) in place of the skeleton below; everything else in this phase is unchanged.

If the source ticket already covers problem, context, proposed solution, and acceptance criteria adequately and brainstorming didn't surface changes, confirm with the user and adopt it as-is. Skip the rewrite. Only add or revise sections where the Q&A revealed gaps or shifts in understanding.

When the ticket needs work, produce or update it to state the proposed approach:

```markdown
# {Title}

<!-- include: ../_partials/ticket-skeleton.md / -->
```

<!-- include: ../_partials/ticket-skeleton-tiers.md / -->

<!-- include: ../_partials/ticket-concision.md / -->

<!-- include: ../../_partials/prose-line-breaks.md / -->

<!-- include: ../_partials/ticket-placement.md / -->

Here, _the implementation_ is the plan artifact (Phase 5): Mechanism the ticket omits is recorded there, not dropped.

<!-- include: ../_partials/ticket-criteria-conventions.md / -->

Present the ticket to the user. Revise until approved.

### Phase 5: Generate implementation plan

<HARD-GATE>
Do NOT start this phase until the ticket from Phase 4 has been explicitly approved.
</HARD-GATE>

Produce a plan that gives a competent coder everything they need, and enough context to adapt when the codebase doesn't match expectations.

> Phase 5 produces the same implementation plan as the standalone `plan` skill, drawn from one shared template. When a ticket is already good and only the plan is needed, run `plan` directly to skip the design phase.

**Spike mode.** If this is a spike, use the spike plan template in [spike conventions](../_data/spike-conventions.md) in place of the template below; everything else in this phase is unchanged.

<!-- include: ../_partials/plan-template.md / -->

Present the plan to the user. Revise until approved.

### Phase 6: Sweep for completeness, save artifacts, and stop

<!-- include: ../_partials/ticket-and-plan-completeness.md / -->

Then save both artifacts:

1. Resolve artifact directory using `save-artifact` conventions:
   - Invoke `node {harness_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `ticket_id`, `project_slug`, and `artifact_base_dir` from the manifest JSON emitted on stdout (auto-generate ticket ID as `{YYYYMMDD}-{4 random hex}` if none found)
   - Target: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`
   - `mkdir -p` the target directory

2. Resolve frontmatter fields for both artifacts. The frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

   Run `{harness_home_dir}/scripts/resolve-frontmatter.sh --skill design-and-plan --interactive true` via Bash. Prepend the output verbatim to each artifact body.

3. Save both artifacts following `save-artifact` naming conventions:
   - Ticket: `{YYYYMMDD-HHMMSSZ}_{slug}_ticket.md`
   - Plan: `{YYYYMMDD-HHMMSSZ}_{slug}_plan.md`

   Prepend the resolved frontmatter to each artifact content before writing.

   Once both artifacts are saved, emit `artifact.written` for each (payloads `{"path":"<ticket path>","kind":"ticket"}` and `{"path":"<plan path>","kind":"plan"}`) per [Lifecycle events](#lifecycle-events), then emit `skill.completed` (payload `{"outcome":"designed-and-planned"}`) on the same turn, before the next-steps prompt below. Emitting completion at the save point folds an abandoned session to a finished state.

4. Report paths and present next steps (the next-steps menu is an ask; the standing rule above applies, with payload `{"prompt":"next-steps"}`).

```
Design and plan complete:
  Ticket: {ticket_path}
  Plan:   {plan_path}
```

**Remote issue update**: Offer to update the remote issue only when the source was a remote ticket (URL or shorthand reference) and the refined ticket differs from the remote body. Phase 4 may adopt a good source ticket unchanged and the sweep may find nothing to fold in; the remote is then already current, and no offer is made. This is a shared-state action; do not update without explicit consent, and never open a turn of its own for the ask.

Render the offer inside the next-steps block as its own labelled sub-block above the options, under the same `Next steps:` header. With two selects present, each shows its `A`/`Q` identifier as a bold prefix (`**A1: Remote issue**`, `**A2: Next action**`) and keeps its own 1-based option numbering, so the user answers `A1: 1, A2: 3`. The consent is independent of the single-select next-step choice, and the next-action options keep their order. Recommend the update: The offer appears only when the remote body is stale against the refined ticket. The recommended option's marker follows how stark that staleness is (■■■ where the refined ticket plainly supersedes the remote body, ■■□ where the delta is real but arguable), and Leave as-is takes ■□□.

```
Next steps:

**A1: Remote issue**
1. 📝 ■■□ Update {ticket_ref} with the refined ticket
2. ⏭️ ■□□ Leave as-is

**A2: Next action**
1. 🧠 ■□□ Refine plan:
   - Clear context and use the `refine-plan` skill with plan: {plan_path}, ticket: {ticket_path}
...
```

On consent:

- GitHub: Write the refined body to a scratch file using the [gh body file](../_data/gh-body-file.md) pattern, then `gh issue edit {number} --body-file "$body_path"`.
- Jira: Update through {skill:update-jira-ticket}, which states the tool-shape branch and bundles the pre-flight checker its HTML surface needs.
- Other platforms: Note that automated update is not yet supported; suggest manual update

<HARD-GATE>
Follow the options, output format, and recommendation rules in [next-steps options](#next-steps-options) exactly. Do not improvise the options. The `**A1: Remote issue**` and `**A2: Next action**` sub-block labels above are the sanctioned wrapper when the remote offer is shown; they add no option and reorder none. The plan was developed interactively with user approval at each stage; use this as recommendation context. Include both `{ticket_path}` and `{plan_path}` in each skill-invoking option line.
</HARD-GATE>

**STOP.** Beyond the remote-issue update above, do not invoke any skill. Do not begin implementation.

## Key principles

- **One question at a time**: Don't overwhelm
- **Multiple choice preferred**: Easier to answer when possible
- **YAGNI ruthlessly**: Cut unnecessary scope from designs
- **Scale to complexity**: A simple task gets a short design and a short plan
- **Plan for engineers, not transcribers**: Communicate decisions, not ceremony
- **The ticket is the contract**: If facts on the ground differ from the plan, the ticket's acceptance criteria are the source of truth

<!-- include: ../_partials/next-steps-after-plan.md / -->

<!-- include: ../_partials/option-format.md / -->

<!-- include: ../_partials/lifecycle-events.md / -->
