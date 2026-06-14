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

`## Dependencies` (external dependencies or blockers) is the one optional section: Insert it between `## Risks` and `## Verification` only when the plan has external blockers, and omit it otherwise.

**Per-task test criterion:** When a task creates or modifies testable behavior, its acceptance criteria must include a test criterion (e.g., "New/modified behavior is covered by tests"). Omit it only when the change falls entirely within the carve-outs defined in the `testing-conventions` skill.

**Per-task documentation criterion:** When a task adds, removes, or renames user-facing surface (CLI flags, commands, API endpoints, configuration keys, environment variables), its acceptance criteria must include updating documentation, help text, and usage examples — including removal of references to anything that no longer exists.

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
