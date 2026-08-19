### Review-response-mode scaffold

After reading the review, enumerate all finding IDs and write exactly this structure. The YAML frontmatter is part of the scaffold, so the first write includes it — see [Frontmatter](#frontmatter) for field resolution.

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
  - `**Action:** {what the diff does, read back from it, or why no change was made}`
- Bump `## Status` to `In progress — finding {N+1} of {F}`.

Before your final structured return block, finalize `## Quality gates` and set `## Status` to `completed`.
