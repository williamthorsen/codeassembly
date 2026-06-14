---
name: design-and-plan
description: Interactive design exploration followed by ticket refinement and implementation planning
user-invocable: true
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

## Process

### Phase 1: Resolve task source and assess relevancy

1. **Resolve the task source** using the [ticket source resolution](../_data/ticket-source-resolution.md) table. Request the `updatedAt` field for use in the relevancy check. Store the resolved metadata for use in the relevancy check and Phase 4's optional remote update.

2. **Assess relevancy** — determine whether the ticket may be stale and, if so, verify it is still relevant.

**Override arguments take precedence:**

- If `--check-staleness` was passed: run the relevancy check immediately (no prompt).
- If `--skip-staleness` was passed: skip the relevancy check entirely.
- If neither was passed: evaluate the heuristic below.

**Heuristic** (evaluated only when the task source is a remote ticket with a last-updated date):

1. Retrieve the ticket's last-updated date from the resolved metadata (e.g., GitHub's `updatedAt` field).
2. Count commits since that date: `git rev-list --count --after="{last-updated date}" HEAD`
3. If the ticket was updated within the last 3 days _or_ fewer than 5 commits have landed since the last update, skip the relevancy check.
4. Otherwise, prompt the user: "This ticket may be out of date ({N} commits since the last update on {date}). Would you like me to check for staleness and relevancy?" If the user declines, continue into Phase 2.

If the task source is plain text or a file (no remote metadata), skip the relevancy check unless `--check-staleness` was explicitly passed.

**The relevancy check** (when triggered by user approval or `--check-staleness`):

Invoke the `assess-ticket` skill with the resolved ticket source and mode `drift`.

**After the check** — interpret the drift verdict:

- 🟢 `none`: Continue silently into Phase 2.
- 🟠 `partial` or 🔴 `severe`: Present the assessment findings to the user. Ask whether to proceed as-is, adjust the scope, or stop.

### Phase 2: Understand the task

1. **Explore project context:** check relevant files, docs, recent commits to understand the affected area of the codebase.

2. **Evaluate the ticket on its merits** — apply the criteria in [ticket evaluation](../_data/ticket-evaluation.md). When evaluation surfaces a divergence from the ticket as written, raise it to the user before forming questions or designing.

3. **Ask clarifying questions** — one at a time:
   - Purpose and motivation
   - Constraints and scope boundaries
   - Success criteria and edge cases
   - Prefer multiple choice when possible
   - Only one question per message
   - When asking option-style questions, follow [`_data/recommendation-gradient.md`](../_data/recommendation-gradient.md). (Reinforces the rule in `AGENTS.md` — intentional redundancy.)

**Important:** Do not use `{tool:AskUserQuestion}` or any interactive selector (pop-up, arrow-key, structured-choice) for multiple-choice questions. Ask the question as plain text in the message body, with options as a numbered list.

### Phase 3: Converge on a design

1. **When the solution is obvious:** present the recommended approach directly. Don't manufacture alternatives for the sake of it.
2. **When the solution is not obvious:** propose 2-3 approaches with trade-offs. Lead with your recommendation and explain why. Rank options per [design priorities](../_data/design-priorities.md).
   - When asking option-style questions, follow [`_data/recommendation-gradient.md`](../_data/recommendation-gradient.md). (Reinforces the rule in `AGENTS.md` — intentional redundancy.)
3. **Present the design** in sections scaled to complexity. Ask after each section whether it looks right.
4. **Get explicit approval** before proceeding.

### Phase 4: Refine the ticket

If the source ticket already covers problem, context, proposed solution, and acceptance criteria adequately — and brainstorming didn't surface changes — confirm with the user and adopt it as-is. Skip the rewrite. Only add or revise sections where the Q&A revealed gaps or shifts in understanding.

When the ticket needs work, produce or update it to capture the proposed approach:

```markdown
# {Title}

## Problem

{Clear statement of what needs to be solved and why}

## Context

{Relevant background, constraints, prior art, related systems}

## Proposed solution

{The shape of the proposed approach: components or boundaries involved, how it fits into the existing system, what tradeoffs were chosen. Keep this section outcome-shaped: Specific code, syntax, and file-level technique belong in the plan, not here.}

<!-- include: ../_partials/acceptance-criteria-scaffold.md / -->
```

**❌ Out of scope here.** Example of what doesn't belong under `## Proposed solution`:

> Modify line 42 of `payload.ts` to use a `Map<string, T>`, then re-export from `helpers.ts`.

File paths, line numbers, code, and syntax-level prescription belong in the implementation plan.

**Test criterion convention:** when a ticket involves code changes to testable behavior, the acceptance criteria must include a test criterion (e.g., "New/modified behavior in this change is covered by tests"). Omit the test criterion only when the change falls entirely within the carve-outs defined in the `testing-conventions` skill.

**Documentation criterion convention:** when a ticket involves changes that add, remove, or rename user-facing surface (CLI flags, commands, API endpoints, configuration keys, environment variables), the acceptance criteria must include corresponding updates to documentation, help text, and usage examples — including removal of references to anything that no longer exists.

Present the ticket to the user. Revise until approved.

**Remote issue update** — offer to update the remote issue only when the source was a remote ticket (URL or shorthand reference). This is a shared-state action — do not update without explicit consent.

- GitHub: Write the refined body to a scratch file using the [gh body file](../_data/gh-body-file.md) pattern, then `gh issue edit {number} --body-file "$body_path"`.
- Other platforms: Note that automated update is not yet supported; suggest manual update

### Phase 5: Generate implementation plan

<HARD-GATE>
Do NOT start this phase until the ticket from Phase 4 has been explicitly approved.
</HARD-GATE>

Produce a plan that gives a competent coder everything they need — and enough context to adapt when the codebase doesn't match expectations.

> Phase 5 produces the same implementation plan as the standalone `plan` skill, drawn from one shared template. When a ticket is already good and only the plan is needed, run `plan` directly to skip the design phase.

<!-- include: ../_partials/plan-template.md / -->

Present the plan to the user. Revise until approved.

### Phase 6: Save artifacts and stop

1. Resolve artifact directory using `save-artifact` conventions:
   - Invoke `node {platform_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `ticket_id`, `project_slug`, and `artifact_base_dir` from the manifest JSON emitted on stdout (auto-generate ticket ID as `{YYYYMMDD}-{4 random hex}` if none found)
   - Target: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`
   - `mkdir -p` the target directory

2. Resolve frontmatter fields for both artifacts. The frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

   Run `{platform_home_dir}/scripts/resolve-frontmatter.sh --skill design-and-plan --interactive true` via Bash. Prepend the output verbatim to each artifact body.

3. Save both artifacts following `save-artifact` naming conventions:
   - Ticket: `{YYYYMMDD-HHMMSSZ}_{slug}_ticket.md`
   - Plan: `{YYYYMMDD-HHMMSSZ}_{slug}_plan.md`

   Prepend the resolved frontmatter to each artifact content before writing.

4. Report paths and present next steps.

```
Design and plan complete:
  Ticket: {ticket_path}
  Plan:   {plan_path}
```

<HARD-GATE>
Read [next-steps-after-plan](../_data/next-steps-after-plan.md) and follow its options, output format, and recommendation rules exactly. Do not improvise the options. The plan was developed interactively with user approval at each stage — use this as recommendation context. Include both `{ticket_path}` and `{plan_path}` in each skill-invoking option line.
</HARD-GATE>

**STOP.** Do not invoke any other skill. Do not begin implementation.

## Key principles

- **One question at a time**: Don't overwhelm
- **Multiple choice preferred**: Easier to answer when possible
- **YAGNI ruthlessly**: Cut unnecessary scope from designs
- **Scale to complexity**: A simple task gets a short design and a short plan
- **Plan for engineers, not transcribers**: Communicate decisions, not ceremony
- **The ticket is the contract**: If facts on the ground differ from the plan, the ticket's acceptance criteria are the source of truth
