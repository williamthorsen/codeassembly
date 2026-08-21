You have `{tool:Write}` but not `{tool:Edit}`. Each update is a full overwrite of the artifact file with the growing findings list.

### Scaffold (first write)

Write exactly this structure. The YAML frontmatter is part of the scaffold so partial writes are parseable too; see [Frontmatter](#frontmatter) for field resolution.

```markdown
---
provenance:
  skill: '{subagent-name}'
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

### Criticality: (pending)

### Summary

(pending)

### Findings

(none yet)

### Insights

(none yet)
```

The literal string `(pending)` on the `### Criticality:` line is the interruption sentinel. The orchestrator distinguishes a mid-flight artifact from a finalized one by checking whether `### Criticality:` parses as a known enum value. Do not invent other placeholder strings.
