**Detail threshold:** Include enough detail that a competent engineer, reading only the plan and ticket, would make the same architectural decisions you would. Omit details that they'd arrive at independently. Compose at this altitude from the outset ([concision principle](../_data/concision.md)); a plan drafted tight beats a fuller one pared down.

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

- {Design choice that the coder needs to know}

**Acceptance criteria:**

- {How to know this task is done}

### Task 2: {Name}

...

## Risks

{Known risks, unknowns, or areas where the coder may need to adapt}

## Verification

{How to verify the whole plan is complete: quality gates, integration checks}
```

`## Dependencies` (external dependencies or blockers) is the one optional section: Insert it between `## Risks` and `## Verification` only when the plan has external blockers, and omit it otherwise.

**Per-task test criterion:** When a task creates or modifies testable behavior, its acceptance criteria must include a test criterion (e.g., "New/modified behavior is covered by tests"). Omit it when the change falls entirely within the carve-outs defined in the `testing-conventions` skill, or when the only tests it would compel are ones that fail that skill's bar for earning a place.

**Per-task documentation criterion:** When a task adds, removes, or renames user-facing surface (CLI flags, commands, API endpoints, configuration keys, environment variables), its acceptance criteria must include updating documentation, help text, and usage examples, including removal of references to anything that no longer exists.

**Per-task README guidance:** When a task writes or revises a README, consult {rulebook:readme-conventions} while planning the task. Its key decisions name the rulebook, the table row that fits the README, and what that row says the README leads with, keeps, and omits, so that the constraints are available to an implementer that cannot load the rulebook.

**Per-task invoked-skill guidance:** When a task invokes a skill, read that skill while planning the task and record in the task's key decisions what the skill declares under three headings: its ordering relative to other skills, its default target when the task passes no argument, and the preconditions that it states. Read every skill that the plan's tasks name, and record a skill declaring none of the three as declaring none, so that a reader can tell a completed check from an absent one. A skill that cannot be read is recorded as unread, never as declaring none. When an ordering constraint names a skill that no task invokes, add the task rather than record the constraint alone.

#### What belongs in the plan

- Task decomposition with ordering and dependencies
- File-level decisions (create, modify, test)
- Key decisions that state design choices
- Acceptance criteria per task
- Risks and unknowns

Code belongs in the plan only when it records a decision that isn't obvious from prose: for example, an interface that constrains how components interact, or an algorithm whose shape isn't implied by the description.

#### What does NOT belong in the plan

- Commit messages
- Shell commands (test runners, build commands)
- TDD step-by-step ceremony
- Implementation code for straightforward logic
