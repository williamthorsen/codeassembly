### Implementation-mode scaffold

After reading the plan, extract each task's title and write exactly this structure. The YAML frontmatter is part of the scaffold, so the first write includes it; see [Frontmatter](#frontmatter) for field resolution.

```markdown
---
provenance:
  skill: orchestrated-coder
  timestamp: '{ISO 8601 UTC timestamp}'
  baseSha: '{short SHA of origin/main, omit if unresolvable}'
  isInteractive: false
  model: '{model id read from the system prompt environment block}'
ticket_id: '{ticket id, omit if absent}'
ticket_ref: '{ticket display ref, omit if absent}'
branch: '{current branch name}'
commit: '{short hash of HEAD}'
pr: '{full PR URL, omit if not resolved}'
run_id: '{run id}'
---

# Change summary: Ticket #{N}

## Status

In progress: Task 0 of {K}

## Per-task summary

### Task 0: {title} (pending)

### Task 1: {title} (pending)

...

## Files changed

(pending)

## Quality gates

(pending)

## Deferred items

(pending)
```

After completing each plan task, overwrite the file:

- Update that task's section heading to `(completed|skipped|deferred)`, followed by files changed, outcome, and notes.
- Bump `## Status` to `In progress: Task {N+1} of {K}`.

Before your final structured return block, finalize:

- `## Files changed`: Aggregate list of all modified files.
- `## Quality gates`: Typecheck, lint, tests results.
- `## Deferred items`: Any intentional omissions or deviations from the plan.
- `## Status`: `completed`.
