### Implementation-mode scaffold

After reading the plan, extract each task's title and write exactly this structure:

```markdown
# Change summary — ticket #{N}

## Status

In progress — task 0 of {K}

## Per-task summary

### Task 0: {title} — pending

### Task 1: {title} — pending

...

## Files changed

(pending)

## Quality gates

(pending)

## Deferred items

(pending)
```

After completing each plan task, overwrite the file:

- Update that task's section heading to `— completed|skipped|deferred`, followed by files changed, outcome, and notes.
- Bump `## Status` to `In progress — task {N+1} of {K}`.

Before your final structured return block, finalize:

- `## Files changed` — aggregate list of all modified files.
- `## Quality gates` — typecheck, lint, tests results.
- `## Deferred items` — any intentional omissions or deviations from the plan.
- `## Status` — `completed`.
