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

1. **Resolve the task source:**

| Input form                                                  | Resolution                                                |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| URL to a known platform (GitHub, Jira, etc.)                | Use platform CLI or WebFetch to retrieve issue content    |
| Other URL                                                   | WebFetch the URL content                                  |
| Shorthand reference (`#99`, `issue 99`, `GitHub issue #99`) | Resolve platform (see below), then fetch via platform CLI |
| File path                                                   | Read the file                                             |
| Plain text                                                  | Use as-is                                                 |

**Shorthand reference resolution** — determine which platform `#99` refers to:

1.  Check `.agents/preferences.yaml` → `integrations` (if exactly one enabled, use it; if multiple, ask)
2.  Check `git remote get-url origin` (e.g., `github.com` → GitHub)
3.  Ask the user

For GitHub: `gh issue view --json number,title,body,labels,updatedAt {number}`

Store the resolved issue metadata (platform, repo, issue number, last-updated date) for use in the relevancy check and Phase 4's optional remote update.

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

1. Identify the area of the codebase the ticket relates to — extract file paths, module names, or feature areas mentioned in the issue body.
2. Look at commits since the ticket's last update that touch that area: `git log --oneline --after="{last-updated date}" -- {paths}`
3. Check whether referenced files and paths still exist.
4. Assess whether the problem described still appears to exist given the changes found.

**After the check:**

- **No concerns found:** continue silently into Phase 2.
- **Concerns found:** present a brief relevancy assessment describing what changed and how it may affect the ticket. Ask the user whether to proceed as-is, adjust the scope, or stop.

### Phase 2: Understand the task

1. **Explore project context:** check relevant files, docs, recent commits to understand the affected area of the codebase.

2. **Ask clarifying questions** — one at a time:
   - Purpose and motivation
   - Constraints and scope boundaries
   - Success criteria and edge cases
   - Prefer multiple choice when possible
   - Only one question per message

### Phase 3: Converge on a design

1. **When the solution is obvious:** present the recommended approach directly. Don't manufacture alternatives for the sake of it.
2. **When the solution is not obvious:** propose 2-3 approaches with trade-offs. Lead with your recommendation and explain why.
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

Present the ticket to the user. Revise until approved.

**Remote issue update** — offer to update the remote issue only when the source was a remote ticket (URL or shorthand reference). This is a shared-state action — do not update without explicit consent.

- GitHub: `gh issue edit {number} --body "{refined body}"`
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

2. Resolve provenance data:
   - Run `git rev-parse --short origin/main` via Bash to obtain `{baseSha}`. If the command fails (no remote, shallow clone), omit `baseSha` from the header.
   - Set `{timestamp}` to the current UTC time in ISO 8601 format.

3. Save both artifacts following `save-artifact` naming conventions:
   - Ticket: `{YYYYMMDD-HHMMSSZ}_{slug}_ticket.md`
   - Plan: `{YYYYMMDD-HHMMSSZ}_{slug}_plan.md` — prepend the following YAML frontmatter to the plan content:

   ```yaml
   ---
   provenance:
     skill: design-and-plan
     timestamp: <timestamp>
     baseSha: <baseSha>
     isInteractive: true
   ---
   ```

   If `baseSha` could not be resolved, omit the `baseSha` line entirely.

4. Report paths and present next steps. The plan was developed interactively with user approval at each stage — use this as recommendation context when applying the rules in [next-steps-after-plan](../_data/next-steps-after-plan.md). Include both `{ticket_path}` and `{plan_path}` in each skill-invoking option line.

```
Design and plan complete:
  Ticket: {ticket_path}
  Plan:   {plan_path}

Next steps:
  1. {emoji} {option}: ...
  2. {emoji} **{recommended option}** (🟢 recommended): ...
  3. {emoji} {option}
```

**STOP.** Do not invoke any other skill. Do not begin implementation.

## Key principles

- **One question at a time** — don't overwhelm
- **Multiple choice preferred** — easier to answer when possible
- **YAGNI ruthlessly** — cut unnecessary scope from designs
- **Scale to complexity** — a simple task gets a short design and a short plan
- **Plan for engineers, not transcribers** — communicate decisions, not ceremony
- **The ticket is the contract** — if facts on the ground differ from the plan, the ticket's acceptance criteria are the source of truth
