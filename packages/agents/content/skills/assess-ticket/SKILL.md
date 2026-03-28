---
name: assess-ticket
description: Assess a ticket against the current codebase for drift, relevance, progress, and complexity
user-invocable: true
---

# Assess ticket

Assess a ticket against the current codebase across four dimensions: drift, relevance, progress, and complexity. Produces a structured assessment with constrained verdicts and supporting evidence.

**Announce at start:** "Using assess-ticket to assess {ticket reference} (mode: {mode})."

## Arguments

- **Ticket source** (optional): issue URL, shorthand reference (`#99`, `issue 99`), file path, or plain text. When omitted, auto-resolved from the environment (see [ticket source resolution](../_data/ticket-source-resolution.md#auto-resolve)).
- **Mode** (optional): `drift`, `relevance`, `progress`, `complexity`, or `all` (default: `all`)

## Process

### 1. Resolve ticket source

Resolve the ticket source using the [ticket source resolution](../_data/ticket-source-resolution.md) table. Request the `updatedAt` field for temporal analysis. Store the resolved metadata (platform, repo, issue number, last-updated date, ticket content).

### 2. Investigate

Run the investigation for the requested mode (or all modes in order when mode is `all`). When mode is `all`, complexity is investigated last so it benefits from context gathered during drift, relevance, and progress analysis.

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

Format the assessment using the structure below. When a single mode is requested, output only that dimension's section (with the header and provenance line). When mode is `all`, output all four dimensions in order.

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

🧩 **Complexity:** {emoji} `{label}`

- {Evidence bullet}
- {Evidence bullet}
```

### Emoji mapping

Drift, relevance, and progress use a **concern scale** — green means no concern, red means high concern:

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

| Dimension      | ⚪        | 🟢           | 🟠          | 🔴              |
| -------------- | --------- | ------------ | ----------- | --------------- |
| **Drift**      | —         | `none`       | `partial`   | `severe`        |
| **Relevance**  | —         | `relevant`   | `uncertain` | `superseded`    |
| **Progress**   | —         | `complete`   | `partial`   | `none`          |
| **Complexity** | `trivial` | `mechanical` | `involved`  | `architectural` |

## Key principles

- **Evidence over opinion** — every verdict must be supported by specific evidence (file paths, commit SHAs, code references)
- **Prefer caution on relevance** — use `uncertain` when signals are ambiguous rather than committing to `superseded`
- **No action, just assessment** — this skill produces output; it does not modify tickets, save artifacts, or post comments
- **Scale to ticket complexity** — a simple ticket gets a brief assessment; a complex ticket with many acceptance criteria gets a thorough one
