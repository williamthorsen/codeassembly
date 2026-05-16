---
name: design-and-plan
description: Interactive design exploration followed by ticket refinement and implementation planning
user-invocable: true
---

# Design and plan

Interactive design exploration followed by ticket refinement and implementation planning. Produces two artifacts: a refined ticket and an implementation plan.

**Announce at start:** "Using design-and-plan to explore requirements and produce a ticket + implementation plan."

## Arguments

- Task source (required): issue URL, shorthand reference (`#99`, `issue 99`), file path, or description of what to build
- `--check-staleness` (optional): always run the relevancy check, regardless of the heuristic
- `--skip-staleness` (optional): never run the relevancy check, regardless of the heuristic

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

- 🟢 `none`: continue silently into Phase 2.
- 🟠 `partial` or 🔴 `severe`: present the assessment findings to the user. Ask whether to proceed as-is, adjust the scope, or stop.

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

If the source ticket already covers problem, context, solution, and acceptance criteria adequately — and brainstorming didn't surface changes — confirm with the user and adopt it as-is. Skip the rewrite. Only add or revise sections where the Q&A revealed gaps or shifts in understanding.

When the ticket needs work, produce or update it to capture the agreed design:

```markdown
# {Title}

## Problem

{Clear statement of what needs to be solved and why}

## Context

{Relevant background, constraints, prior art, related systems}

## Solution

{The agreed approach — what will be built and how it fits into the existing system}

## Acceptance criteria

- [ ] {Criterion 1}
- [ ] {Criterion 2}
```

**Test criterion convention:** when a ticket involves code changes to testable behavior, the acceptance criteria must include a test criterion (e.g., "New/modified behavior in this change is covered by tests"). Omit the test criterion only when the change falls entirely within the carve-outs defined in the `testing-conventions` skill.

**Documentation criterion convention:** when a ticket involves changes that add, remove, or rename user-facing surface (CLI flags, commands, API endpoints, configuration keys, environment variables), the acceptance criteria must include corresponding updates to documentation, help text, and usage examples — including removal of references to anything that no longer exists.

Present the ticket to the user. Revise until approved.

**Remote issue update** — offer to update the remote issue only when the source was a remote ticket (URL or shorthand reference). This is a shared-state action — do not update without explicit consent.

- GitHub: write the refined body to a scratch file using the [gh body file](../_data/gh-body-file.md) pattern, then `gh issue edit {number} --body-file "$body_path"`.
- Other platforms: note that automated update is not yet supported; suggest manual update

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

Apply the same test criterion convention here: when a task creates or modifies testable behavior, include a test criterion in its acceptance criteria. This ensures the test requirement propagates from the ticket through to the plan's per-task level, where the coder and reviewers consume it.

Apply the same documentation criterion convention here: when a task adds, removes, or renames user-facing surface (CLI flags, commands, API endpoints, configuration keys, environment variables), include a criterion for updating documentation, help text, and usage examples — including removal of references to anything that no longer exists.

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
   - Use `get-session-context` to obtain `ticket_id`, `project_slug`, and `artifact_base_dir` (auto-generate ticket ID as `{YYYYMMDD}-{4 random hex}` if none found)
   - Target: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`
   - `mkdir -p` the target directory

2. Resolve provenance and identity data:
   - Run `git rev-parse --short origin/main` via Bash to obtain `{baseSha}`. If the command fails (no remote, shallow clone), omit `baseSha` from the header.
   - Set `{timestamp}` to the current UTC time in ISO 8601 format.
   - Read `branch_name`, `ticket_id`, and `ticket_ref` from session context. `branch_name` is always present; `ticket_id` and `ticket_ref` are emitted only when non-null.
   - Run `git rev-parse --short HEAD` via Bash to obtain `{commit}`.
   - Resolve `{pr}` via the shared dispatch in [`../_data/pr-resolution.md`](../_data/pr-resolution.md). Read `platform` from session context, then run the matching snippet via the Bash tool with `timeout: 5000`:
     - **GitHub:** `gh pr list --head "$BRANCH" --state all --json url --jq '.[0].url // empty'`
     - **Bitbucket:** the `curl` snippet in `pr-resolution.md` against `https://api.bitbucket.org/2.0/repositories/{workspace}/{repo}/pullrequests?q=source.branch.name="{branch}"`, extracting `.values[0].links.html.href`.

     On non-empty output, set `{pr}` to the URL. On empty output (no PR exists), omit the `pr:` line — emit no warning. On non-zero exit, timeout, or other failure, omit the `pr:` line and emit `Note: PR lookup failed; proceeding without pr field.` in the agent text output.

3. Save both artifacts following `save-artifact` naming conventions. Both artifacts begin with YAML frontmatter conforming to the [universal artifact frontmatter](../_data/artifact-conventions.md#universal-artifact-frontmatter) schema:
   - Ticket: `{YYYYMMDD-HHMMSSZ}_{slug}_ticket.md`
   - Plan: `{YYYYMMDD-HHMMSSZ}_{slug}_plan.md`

   Prepend this YAML frontmatter to each artifact content:

   ```yaml
   ---
   provenance:
     skill: design-and-plan
     timestamp: <timestamp>
     baseSha: <baseSha>
     isInteractive: true
   ticket_id: <ticket_id>
   ticket_ref: <ticket_ref>
   branch: <branch_name>
   commit: <commit>
   pr: <pr>
   ---
   ```

   Field-emission rules:
   - Include `baseSha` only if resolved successfully.
   - Include `ticket_id` and `ticket_ref` only when non-null in session context.
   - Include `pr` only when the resolution returned a non-empty URL.
   - `branch` and `commit` are always emitted.

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

- **One question at a time** — don't overwhelm
- **Multiple choice preferred** — easier to answer when possible
- **YAGNI ruthlessly** — cut unnecessary scope from designs
- **Scale to complexity** — a simple task gets a short design and a short plan
- **Plan for engineers, not transcribers** — communicate decisions, not ceremony
- **The ticket is the contract** — if facts on the ground differ from the plan, the ticket's acceptance criteria are the source of truth
