The assessment covers five dimensions: drift, relevance, progress, advisability, and complexity. Each produces a constrained verdict and supporting evidence.

### Investigation order

When assessing every dimension, investigate them in the order below. Advisability is investigated after progress, synthesizing the prior dimensions' context, and complexity is investigated last so that it benefits from context gathered during drift, relevance, progress, and advisability analysis. **Skip both advisability and complexity when progress is `complete`**; neither has value for finished work.

### Drift

Determine whether the ticket's factual assumptions still match the codebase.

1. Extract file paths, module names, API references, and structural assumptions from the ticket body. A measured count in the body is not an assumption: A figure that has changed since the ticket was written is not drift.
2. Check whether referenced files and paths still exist.
3. If the ticket has a last-updated date, examine commits since that date in affected areas: `git log --oneline --no-merges --after="{date}" -- {paths}`
4. If the ticket does not have a last-updated date, compare the ticket's assumptions against the current state of the affected files.
5. Assess whether the assumptions hold, have partially drifted, or are no longer valid.

**Verdicts:**

- 🟢 `none`: All factual assumptions hold; referenced files, APIs, and structures match the ticket's description
- 🟠 `partial`: Some assumptions are wrong but the ticket is salvageable; the core approach still applies with adjustments
- 🔴 `severe`: The ticket's factual premise no longer applies; referenced modules have been restructured, removed, or fundamentally changed

### Relevance

Determine whether the motivation for the ticket still applies.

1. Identify the problem or need that the ticket was created to address.
2. Look at broader codebase changes (not limited to paths mentioned in the ticket). Was the problem solved by a different approach? Was the feature or system targeted by the ticket removed or replaced?
3. Check whether the conditions that motivated the ticket still exist.

This dimension requires understanding intent, not just facts. When signals are ambiguous, prefer `uncertain` over a stronger verdict.

**Verdicts:**

- 🟢 `relevant`: The motivation still applies; the problem or need described in the ticket still exists
- 🟠 `uncertain`: Signals suggest the need may have changed but human judgment is required to confirm
- 🔴 `superseded`: The need has been addressed by other means or the target system no longer exists

### Progress

Determine whether the described work has been implemented. The output format depends on whether the ticket has acceptance criteria.

**When the ticket has acceptance criteria:**

1. Extract acceptance criteria from the ticket. These may be checkboxes, numbered lists, or prose descriptions of expected behavior.
2. For each criterion, examine the codebase to determine whether it has been met.
3. Present the verdict with a count summary (e.g., "4 of 7 criteria met"), followed by each criterion as a checklist item.

**When the ticket does not have acceptance criteria:**

1. Identify what the ticket's solution describes: new files, modified APIs, added tests, changed behavior.
2. Search the codebase for evidence of these artifacts.
3. Present the verdict followed by evidence bullets describing what has and hasn't been done.

**Verdicts:**

- 🟢 `complete`: All described work (or all acceptance criteria) has been done
- 🟠 `partial`: Some of the described work has been done but significant portions remain
- 🔴 `none`: None of the described work is present in the codebase

### Advisability

Determine whether the ticket should be implemented as written. Synthesize the four facets defined in `{harness_home_dir}/skills/_sources/codeassembly/_data/ticket-evaluation.md` (problem reality, scope correctness, solution soundness, title accuracy) against the codebase and ticket text.

1. Apply each facet in turn. Does the underlying observation hold? Is scope right at the appropriate class? Does the proposed solution treat the cause? Does the title accurately describe the work?
2. Synthesize a verdict from the facet results.
3. Emit one prose evidence bullet per concern raised by the facets. Do not prefix a bullet with its facet name. Omit bullets entirely when the verdict is `advisable`.

Bias toward `advisable`: For a recommendation dimension, false-positive concerns are noisier than false-negative passes. Default to `advisable` unless the codebase shows specific evidence of a facet concern.

**Verdicts:**

- 🟢 `advisable`: Recommend implementing as written; all four facets pass scrutiny
- 🟠 `questionable`: Recommend with concerns; one or more facets raise issues warranting human review
- 🔴 `inadvisable`: Recommend against implementing as written; rework needed before proceeding

### Complexity

Classify how complex the described work is relative to the current codebase. Reference the complexity classification rubric in `{harness_home_dir}/skills/_sources/codeassembly/_data/complexity-classification.md` for level definitions.

1. Identify the work surface: files, modules, packages, APIs, interfaces, and dependencies that the ticket describes changing or creating. Verify against the codebase.
2. Assess cross-cutting extent: how many modules or packages are touched, whether changes cross package boundaries, and whether shared interfaces or data structures are affected.
3. Assess decision density: whether the work follows established patterns or requires new ones, and whether design choices could go multiple ways.
4. Classify against the rubric. When characteristics span two levels, prefer the higher level.

**Verdicts:**

- ⚪ `trivial`: Single-line or purely mechanical; does not require judgment
- 🟢 `mechanical`: Follows an obvious pattern; single module, without API or behavioral changes
- 🟠 `involved`: Requires understanding context; touches multiple files or modules; may involve design decisions
- 🔴 `architectural`: Cross-cutting concerns, new patterns, dependency boundary changes, or far-reaching consequences

### Output format

Format the assessment using the structure below, with the dimensions in order and advisability and complexity omitted when progress is `complete`.

**When the ticket has acceptance criteria:**

```markdown
## Assessment: {ticket title} (#{number})

Assessed at {YYYYMMDD-HHMMSSZ} against {short SHA}

Δ **Drift:** {emoji} `{verdict}`

- {Evidence bullet}
- {Evidence bullet}

🎯 **Relevance:** {emoji} `{verdict}`

- {Evidence bullet}
- {Evidence bullet}

📶 **Progress:** {emoji} `{verdict}` ({N} of {M} criteria met)

- ✅ {Criterion met}
- ✅ {Criterion met}
- ❌ {Criterion not met}

🧭 **Advisability:** {emoji} `{verdict}`

- {Evidence bullet}
- {Evidence bullet}

🧩 **Complexity:** {emoji} `{label}`

- {Evidence bullet}
- {Evidence bullet}
```

**When the ticket does not have acceptance criteria:**

```markdown
## Assessment: {ticket title} (#{number})

Assessed at {YYYYMMDD-HHMMSSZ} against {short SHA}

Δ **Drift:** {emoji} `{verdict}`

- {Evidence bullet}
- {Evidence bullet}

🎯 **Relevance:** {emoji} `{verdict}`

- {Evidence bullet}
- {Evidence bullet}

📶 **Progress:** {emoji} `{verdict}`

- {Evidence bullet}
- {Evidence bullet}

🧭 **Advisability:** {emoji} `{verdict}`

- {Evidence bullet}
- {Evidence bullet}

🧩 **Complexity:** {emoji} `{label}`

- {Evidence bullet}
- {Evidence bullet}
```

### Emoji mapping

Drift, relevance, progress, and advisability use a **concern scale**, on which green means no concern and red means high concern:

| Verdict position | Emoji |
| ---------------- | ----- |
| No concern       | 🟢    |
| Mixed / unclear  | 🟠    |
| High concern     | 🔴    |

Complexity uses a **size scale**, on which emojis represent effort and scope, not concern:

| Level | Emoji |
| ----- | ----- |
| 1     | ⚪    |
| 2     | 🟢    |
| 3     | 🟠    |
| 4     | 🔴    |

### Verdict reference

| Dimension        | ⚪        | 🟢           | 🟠             | 🔴              |
| ---------------- | --------- | ------------ | -------------- | --------------- |
| **Drift**        | n/a       | `none`       | `partial`      | `severe`        |
| **Relevance**    | n/a       | `relevant`   | `uncertain`    | `superseded`    |
| **Progress**     | n/a       | `complete`   | `partial`      | `none`          |
| **Advisability** | n/a       | `advisable`  | `questionable` | `inadvisable`   |
| **Complexity**   | `trivial` | `mechanical` | `involved`     | `architectural` |

### Baseline verdicts

<!-- include: ticket-assessment-baseline.md / -->

### Assessment principles

- **Evidence over opinion**: Every verdict must be supported by specific evidence (file paths, commit SHAs, code references)
- **Prefer caution on relevance**: Use `uncertain` when signals are ambiguous rather than committing to `superseded`
- **Bias `advisable` absent evidence**: Every non-baseline advisability verdict calls for a follow-up action; default to `advisable` unless the codebase shows specific evidence of a facet concern
- **Scale to ticket complexity**: A simple ticket gets a brief assessment; a complex ticket with many acceptance criteria gets a thorough one
