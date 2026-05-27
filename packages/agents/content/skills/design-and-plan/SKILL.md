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

**Important:** Do not use interactive prompt mechanisms (pop-ups, arrow-key selectors, structured choice tools) for multiple-choice questions. Ask the question as plain text in the message body, with options as a numbered list.

### Phase 3: Converge on a design

1. **When the solution is obvious:** present the recommended approach directly. Don't manufacture alternatives for the sake of it.
2. **When the solution is not obvious:** propose 2-3 approaches with trade-offs. Lead with your recommendation and explain why. Rank options per [design priorities](../_data/design-priorities.md).
   - When asking option-style questions, follow [`_data/recommendation-gradient.md`](../_data/recommendation-gradient.md). (Reinforces the rule in `AGENTS.md` — intentional redundancy.)
3. **Present the design** in sections scaled to complexity. Ask after each section whether it looks right.
4. **Get explicit approval** before proceeding.

### Phase 4: Refine the ticket

If the source ticket already covers problem, context, proposed solution, and acceptance criteria adequately — and brainstorming didn't surface changes — you may adopt the source as-is. Skip the rewrite. Only add or revise sections where the Q&A revealed gaps or shifts in understanding. Proceed to the pre-presentation audit and user confirmation at the end of this phase.

When the ticket needs work, produce or update it to capture the proposed approach:

```markdown
# {Title}

## Problem

{Clear statement of what needs to be solved and why}

## Context

{Relevant background, constraints, prior art, related systems}

## Proposed solution

{The shape of the proposed approach: components or boundaries involved, how it fits into the existing system, what tradeoffs were chosen. Keep this section outcome-shaped: Specific code, syntax, and file-level technique belong in the plan, not here.}

## Acceptance criteria

- [ ] {Criterion 1}
- [ ] {Criterion 2}
```

**❌ Bad** — `## Proposed solution` that combines file paths, a type declaration, and procedural steps:

> Modify `src/api/errors.ts` to add a new type `interface ApiError { code: string; message: string; details?: Record<string, unknown>; }`. Then update `src/api/handler.ts` to wrap every caught exception with `serializeError()`, and replace existing `throw new Error(...)` calls with `throw new ApiError(...)`.

**✅ Good** — same decision, outcome-shaped:

> API responses use a structured error envelope (machine-readable code, human-readable message, optional details map) for all caught exceptions. Existing throw sites are migrated to the new envelope; bare-error responses are no longer produced.

File paths, line numbers, code, and syntax-level prescription belong in the implementation plan.

**Test criterion convention:** when a ticket involves code changes to testable behavior, the acceptance criteria must include a test criterion (e.g., "New/modified behavior in this change is covered by tests"). Omit the test criterion only when the change falls entirely within the carve-outs defined in the `testing-conventions` skill.

**Documentation criterion convention:** when a ticket involves changes that add, remove, or rename user-facing surface (CLI flags, commands, API endpoints, configuration keys, environment variables), the acceptance criteria must include corresponding updates to documentation, help text, and usage examples — including removal of references to anything that no longer exists.

<HARD-GATE>
Before presenting the ticket to the user, audit your draft for plan-shaped content. This audit applies whether you wrote a new draft or adopted the source ticket as-is — a plan-shaped source ticket cannot pass through unaltered. If you find any of the following, return to the rewrite path and re-render in the four required sections:

- A `## Tasks`, `## Implementation`, `## Files`, `## Plan`, or `## Steps` section
- A file path (e.g., `src/lib/foo.ts`)
- A fenced code block
- A type, interface, function, or method declaration
- A regex literal or string literal prescribing syntax
- Step-by-step procedural instructions ("first do X, then Y")

The ticket should read intelligibly to a stakeholder who never opens the codebase.
</HARD-GATE>

Present the ticket to the user. Revise until approved.

**Remote issue update** — offer to update the remote issue only when the source was a remote ticket (URL or shorthand reference). This is a shared-state action — do not update without explicit consent.

- GitHub: Write the refined body to a scratch file using the [gh body file](../_data/gh-body-file.md) pattern, then `gh issue edit {number} --body-file "$body_path"`.
- Other platforms: Note that automated update is not yet supported; suggest manual update

### Phase 5: Generate implementation plan

<HARD-GATE>
Do NOT start this phase until the ticket from Phase 4 has been explicitly approved.
</HARD-GATE>

Produce a plan that gives a competent coder everything they need — and enough context to adapt when the codebase doesn't match expectations.

**Detail threshold:** Include enough detail that a competent engineer, reading only the plan and ticket, would make the same architectural decisions you would. Omit details they'd arrive at independently.

```markdown
# Implementation plan: {Title}

## Context

{Brief context linking this plan to the ticket}

## Approach

{High-level strategy, 2-3 sentences}

## Tasks

### Task 1: {Name}

**Files:**

- Create: `path/to/new-file.ts`
- Modify: `path/to/existing.ts`
- Test: `path/to/test.ts`

**What:** {What this task accomplishes and why}

**Key decisions:**

- {Design choice the coder needs to know}

**Acceptance criteria:**

- {How to know this task is done}

Apply the same test criterion convention here: When a task creates or modifies testable behavior, include a test criterion in its acceptance criteria. This ensures the test requirement propagates from the ticket through to the plan's per-task level, where the coder and reviewers consume it.

Apply the same documentation criterion convention here: When a task adds, removes, or renames user-facing surface (CLI flags, commands, API endpoints, configuration keys, environment variables), include a criterion for updating documentation, help text, and usage examples — including removal of references to anything that no longer exists.

### Task 2: {Name}

...

## Risks

{Known risks, unknowns, or areas where the coder may need to adapt}

## Verification

{How to verify the whole plan is complete — quality gates, integration checks}
```

#### What belongs in the plan

- Task decomposition with ordering and dependencies
- File-level decisions (create, modify, test)
- Key decisions that embody design choices
- Acceptance criteria per task
- Risks and unknowns

Code belongs in the plan only when it captures a decision that isn't obvious from prose — for example, an interface that constrains how components interact, or an algorithm whose shape isn't implied by the description.

#### What does NOT belong in the plan

- Commit messages
- Shell commands (test runners, build commands)
- TDD step-by-step ceremony
- Implementation code for straightforward logic

Present the plan to the user. Revise until approved.

### Phase 6: Save artifacts and stop

1. Resolve artifact directory using `save-artifact` conventions:
   - Invoke `node {platform_home_dir}/skills/derive-session-context/derive-session-context.mjs` via Bash to obtain `ticket_id`, `project_slug`, and `artifact_base_dir` from the manifest JSON emitted on stdout (auto-generate ticket ID as `{YYYYMMDD}-{4 random hex}` if none found)
   - Target: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`
   - `mkdir -p` the target directory

2. Resolve frontmatter fields for both artifacts. The frontmatter conforms to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema.

   Run `{platform_home_dir}/scripts/resolve-frontmatter.sh --skill design-and-plan --interactive true` via Bash. Prepend the output verbatim to each artifact body.

   If the script's stderr contains `Note: PR lookup failed; proceeding without pr field.`, surface that line in your text output once.

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
