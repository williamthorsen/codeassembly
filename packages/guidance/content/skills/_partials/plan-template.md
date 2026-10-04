**Detail threshold:** Include enough detail that a competent engineer, reading only the plan and ticket, would make the same architectural decisions you would. Omit details that they'd arrive at independently. Compose at this altitude from the outset ([concision principle](../_data/concision.md)); a plan drafted tight beats a fuller one pared down.

```markdown
# Implementation plan: {Title}

## Context

{Brief context linking this plan to the ticket}

## Approach

{High-level strategy, 2-3 sentences}

## Decisions taken

- {A decision that the agent took without asking, with its one-line reason; append `(provisional)` when it awaits the checkpoint}

## Tasks

### Task 1: {Name}

**Files:**

- Create: `path/to/new-file.ts`
- Modify: `path/to/existing.ts`
- Test: `path/to/test.ts`

**What:** {What this task accomplishes and why}

**Key decisions:**

- {Design choice that the coder needs to know}

**Acceptance criteria:**

- {How to know this task is done}

### Task 2: {Name}

...

## Risks

{Known risks, unknowns, or areas where the coder may need to adapt}

## Verification

{The checks that the agent runs to verify the whole plan is complete: quality gates, integration checks}
```

`## Dependencies` (external dependencies or blockers) is the one optional section: Insert it between `## Risks` and `## Verification` only when the plan has external blockers, and omit it otherwise.

**Per-task test criterion:** When a task creates or modifies testable behavior, its acceptance criteria must include a test criterion (e.g., "New/modified behavior is covered by tests"). Omit it when the change falls entirely within the carve-outs defined in the `testing-conventions` skill, or when the only tests it would compel are ones that fail that skill's bar for earning a place.

**Per-task documentation criterion:** When a task adds, removes, or renames user-facing surface (CLI flags, commands, API endpoints, configuration keys, environment variables), its acceptance criteria must include updating documentation, help text, and usage examples, including removal of references to anything that no longer exists.

**Per-task README guidance:** When a task writes or revises a README, consult {rulebook:readme-conventions} while planning the task. Its key decisions name the rulebook, the table row that fits the README, and what that row says the README leads with, keeps, and omits, so that the constraints are available to an implementer that cannot load the rulebook.

**Per-task interface guidance:** When a task defines colour tokens, styles text, or builds a page, a prototype, or a UI component, consult {rulebook:accessibility-conventions} while planning the task. Its key decisions state the rulebook's contrast and size floors and the contrast check, so that the constraints are available to an implementer that cannot load the rulebook.

**Per-task invoked-skill guidance:** When a task invokes a skill, read that skill while planning the task and record in the task's key decisions what the skill declares under three headings: its ordering relative to other skills, its default target when the task does not pass an argument, and the preconditions that it states. Read every skill that the plan's tasks name, and record a skill declaring none of the three as declaring none, so that a reader can tell a completed check from an absent one. A skill that cannot be read is recorded as unread, never as declaring none. When an ordering constraint names a skill that the plan's tasks do not invoke, add the task rather than record the constraint alone.

**Who performs a step.** Every task and every `## Verification` check names the agent as its actor. A part that only the developer can perform is written as a `**Residue:**` line under the task, after **What:** and in the same position as **Key decisions:**, in the form "**Residue:** {what the developer alone can do}: {why the agent cannot}", and the task's other parts stay the agent's. Check a resource's availability before naming it as a risk; when a step needs something that only the developer can supply, such as a credential or a running service, the step states the ask for that resource, never a degraded fallback and never the step as the developer's. A manual check is cut when an automated test or a check in `## Verification` asserts the same observable outcome, and stays, as the agent's, when it would show something that no test asserts. A check proposed against a deployed branch accounts for a `live` worktree, which runs the merged tree rather than the branch.

Before (a verification task handed to the developer):

> **What:** After the branch is pushed and Vercel builds the preview, the owner exercises `/lab/book-row` by keyboard and on a touch device against the checklist in Task 9. Defects found there are fixed on the branch. Once the owner confirms, delete the lab route in its own commit.
>
> **Acceptance criteria:** The owner has confirmed the controls on the preview.

After (the agent runs the check, and the residue is the one part that emulation cannot show):

> **What:** Drive `/lab/book-row` through the debug browser with keyboard input and touch emulation against the checklist in Task 9, fix what the check finds on the branch, then delete the lab route in its own commit.
>
> **Residue:** How the rating control feels on a physical phone: emulation does not report touch feel.
>
> **Acceptance criteria:** Every item of the checklist passes in the debug browser, and the lab route is gone.

#### What belongs in the plan

- Task decomposition with ordering and dependencies
- File-level decisions (create, modify, test)
- Key decisions that state design choices
- The decisions ledger: every call that the agent took in place of an ask, its reason, and whether it is provisional
- Acceptance criteria per task
- Risks and unknowns

Code belongs in the plan only when it records a decision that isn't obvious from prose: for example, an interface that constrains how components interact, or an algorithm whose shape isn't implied by the description.

#### What does NOT belong in the plan

- Commit messages
- Shell commands (test runners, build commands)
- TDD step-by-step ceremony
- Implementation code for straightforward logic
