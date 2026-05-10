### Review-response-mode scaffold

After reading the review, enumerate all finding IDs and write exactly this structure:

```markdown
# Change summary — round {R}

## Status

In progress — finding 0 of {F}

## Findings addressed

### F1: {title} — pending

### F2: {title} — pending

### W1: {title} — pending

...

## Quality gates

(pending)
```

After addressing each finding, overwrite the file:

- Replace that finding's `— pending` marker with the filled subsection:
  - `**Status:** FIXED | NOT_FIXED | ALREADY_RESOLVED`
  - `**Action:** {what was done, or why no change was made}`
- Bump `## Status` to `In progress — finding {N+1} of {F}`.

Before your final structured return block, finalize `## Quality gates` and set `## Status` to `completed`.
