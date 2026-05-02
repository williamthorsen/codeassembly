---
name: assess-ticket
description: Assess a ticket against the current codebase for drift, relevance, progress, advisability, and complexity, and prompt for follow-up actions
user-invocable: true
---

# Assess ticket

Assess a ticket against the current codebase across five dimensions: drift, relevance, progress, advisability, and complexity. Produces a structured assessment with constrained verdicts and supporting evidence.

**Announce at start:** "Using assess-ticket to assess {ticket reference} (mode: {mode})."

## Arguments

- **Ticket source** (optional): issue URL, shorthand reference (`#99`, `issue 99`), file path, or plain text. When omitted, auto-resolved from the environment (see [ticket source resolution](../_data/ticket-source-resolution.md#auto-resolve)).
- **Mode** (optional): `drift`, `relevance`, `progress`, `advisability`, `complexity`, or `all` (default: `all`)

## Process

### 1. Resolve ticket source

Resolve the ticket source using the [ticket source resolution](../_data/ticket-source-resolution.md) table. Request the `updatedAt` field for temporal analysis. Store the resolved metadata (platform, repo, issue number, last-updated date, ticket content).

### 2. Investigate

Run the investigation for the requested mode (or all modes in order when mode is `all`). When mode is `all`, advisability is investigated after progress (synthesizing the prior dimensions' context), and complexity is investigated last so it benefits from context gathered during drift, relevance, progress, and advisability analysis. **Skip both advisability and complexity when progress is `complete`** — neither has value for finished work.

#### Drift

Determine whether the ticket's factual assumptions still match the codebase.

1. Extract file paths, module names, API references, and structural assumptions from the ticket body.
2. Check whether referenced files and paths still exist.
3. If the ticket has a last-updated date, examine commits since that date in affected areas: `git log --oneline --no-merges --after="{date}" -- {paths}`
4. If no last-updated date is available, compare the ticket's assumptions against the current state of the affected files.
5. Assess whether the assumptions hold, have partially drifted, or are no longer valid.

**Verdicts:**

- 🟢 `none` — all factual assumptions hold; referenced files, APIs, and structures match the ticket's description
- 🟠 `partial` — some assumptions are wrong but the ticket is salvageable; the core approach still applies with adjustments
- 🔴 `severe` — the ticket's factual premise no longer applies; referenced modules have been restructured, removed, or fundamentally changed

#### Relevance

Determine whether the motivation for the ticket still applies.

1. Identify the problem or need the ticket was created to address.
2. Look at broader codebase changes (not limited to paths mentioned in the ticket) — was the problem solved by a different approach? Was the feature or system the ticket targets removed or replaced?
3. Check whether the conditions that motivated the ticket still exist.

This mode requires understanding intent, not just facts. When signals are ambiguous, prefer `uncertain` over a stronger verdict.

**Verdicts:**

- 🟢 `relevant` — the motivation still applies; the problem or need described in the ticket still exists
- 🟠 `uncertain` — signals suggest the need may have changed but human judgment is required to confirm
- 🔴 `superseded` — the need has been addressed by other means or the target system no longer exists

#### Progress

Determine whether the described work has been implemented. The output format adapts based on whether the ticket has acceptance criteria.

**When the ticket has acceptance criteria:**

1. Extract acceptance criteria from the ticket. These may be checkboxes, numbered lists, or prose descriptions of expected behavior.
2. For each criterion, examine the codebase to determine whether it has been met.
3. Present the verdict with a count summary (e.g., "4 of 7 criteria met"), followed by each criterion as a checklist item.

**When the ticket has no acceptance criteria:**

1. Identify what the ticket's solution describes — new files, modified APIs, added tests, changed behavior.
2. Search the codebase for evidence of these artifacts.
3. Present the verdict followed by evidence bullets describing what has and hasn't been done.

**Verdicts:**

- 🟢 `complete` — all described work (or all acceptance criteria) has been done
- 🟠 `partial` — some of the described work has been done but significant portions remain
- 🔴 `none` — none of the described work is present in the codebase

#### Advisability

Determine whether the ticket should be implemented as written. Synthesize the four facets defined in [ticket evaluation](../_data/ticket-evaluation.md) (problem reality, scope correctness, solution soundness, title accuracy) against the codebase and ticket text.

1. Apply each facet in turn — does the underlying observation hold? Is scope right at the appropriate class? Does the proposed solution treat the cause? Does the title accurately describe the work?
2. Synthesize a verdict from the facet results.
3. Emit one prose evidence bullet per concern surfaced. Bullets do not prefix facet names. Omit bullets entirely when the verdict is `advisable`.

Bias toward `advisable` — for a recommendation dimension, false-positive concerns are noisier than false-negative passes. Default to `advisable` unless the codebase yields specific evidence of a facet concern.

**Verdicts:**

- 🟢 `advisable` — recommend implementing as written; all four facets pass scrutiny
- 🟠 `questionable` — recommend with concerns; one or more facets surface issues warranting human review
- 🔴 `inadvisable` — recommend against implementing as written; rework needed before proceeding

#### Complexity

Classify how complex the described work is relative to the current codebase. Reference the [complexity classification](../_data/complexity-classification.md) rubric for level definitions.

1. Identify the work surface — files, modules, packages, APIs, interfaces, and dependencies that the ticket describes changing or creating. Verify against the codebase.
2. Assess cross-cutting extent — how many modules or packages are touched, whether changes cross package boundaries, and whether shared interfaces or data structures are affected.
3. Assess decision density — whether the work follows established patterns or requires new ones, and whether design choices could go multiple ways.
4. Classify against the rubric. When characteristics span two levels, prefer the higher level.

**Verdicts:**

- ⚪ `trivial` — single-line or purely mechanical; no judgment needed
- 🟢 `mechanical` — follows an obvious pattern; single module, no API or behavioral changes
- 🟠 `involved` — requires understanding context; touches multiple files or modules; may involve design decisions
- 🔴 `architectural` — cross-cutting concerns, new patterns, dependency boundary changes, or far-reaching consequences

### 3. Output

Format the assessment using the structure below. When a single mode is requested, output only that dimension's section (with the header and provenance line). When mode is `all`, output all dimensions in order — omitting both advisability and complexity when progress is `complete`.

Obtain the base SHA via `git rev-parse --short HEAD`.

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

**When the ticket has no acceptance criteria:**

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

### 4. Next steps

After presenting the assessment output, evaluate whether any verdicts are non-baseline and, if so, present follow-up actions. Follow [next steps after assessment](next-steps-after-assessment.md) for the baseline definition, verdict-to-actions mapping, combination rules, and interaction protocol.

### Emoji mapping

Drift, relevance, progress, and advisability use a **concern scale** — green means no concern, red means high concern:

| Verdict position | Emoji |
| ---------------- | ----- |
| No concern       | 🟢    |
| Mixed / unclear  | 🟠    |
| High concern     | 🔴    |

Complexity uses a **size scale** — emojis represent effort and scope, not concern:

| Level | Emoji |
| ----- | ----- |
| 1     | ⚪    |
| 2     | 🟢    |
| 3     | 🟠    |
| 4     | 🔴    |

### Verdict reference

| Dimension        | ⚪        | 🟢           | 🟠             | 🔴              |
| ---------------- | --------- | ------------ | -------------- | --------------- |
| **Drift**        | —         | `none`       | `partial`      | `severe`        |
| **Relevance**    | —         | `relevant`   | `uncertain`    | `superseded`    |
| **Progress**     | —         | `complete`   | `partial`      | `none`          |
| **Advisability** | —         | `advisable`  | `questionable` | `inadvisable`   |
| **Complexity**   | `trivial` | `mechanical` | `involved`     | `architectural` |

## Key principles

- **Evidence over opinion** — every verdict must be supported by specific evidence (file paths, commit SHAs, code references)
- **Prefer caution on relevance** — use `uncertain` when signals are ambiguous rather than committing to `superseded`
- **Bias `advisable` absent evidence** — Advisability fires a next-steps prompt on every non-baseline verdict; default to `advisable` unless the codebase yields specific evidence of a facet concern
- **Assessment first, action on request** — lead with the assessment; offer follow-up actions but do not execute without user selection
- **Scale to ticket complexity** — a simple ticket gets a brief assessment; a complex ticket with many acceptance criteria gets a thorough one
