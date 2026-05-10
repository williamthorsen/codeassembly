### Scaffold (first write)

Write exactly this structure:

```markdown
### Criticality: (pending)

### Summary

(pending)

### Findings

(none yet)
```

The literal string `(pending)` on the `### Criticality:` line is the interruption sentinel. The orchestrator distinguishes a mid-flight artifact from a finalized one by checking whether `### Criticality:` parses as a known enum value. Do not invent other placeholder strings.
