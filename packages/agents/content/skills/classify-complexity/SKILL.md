---
name: classify-complexity
description: Classify a ticket's complexity against the current codebase using the 4-level rubric
user-invocable: true
---

# Classify complexity

Classify a ticket's complexity by examining the described work against the current codebase. Produces a structured assessment with a verdict, scope breakdown, drivers, and risks.

**Announce at start:** "Using classify-complexity to classify {ticket reference}."

## Arguments

- **Ticket source** (optional): Issue URL, shorthand reference (`#99`, `issue 99`), file path, or plain text. When omitted, auto-resolved from the environment (see [ticket source resolution](../_data/ticket-source-resolution.md#auto-resolve)).

## Process

### 1. Resolve ticket source

Resolve the ticket source using the [ticket source resolution](../_data/ticket-source-resolution.md) table. Store the resolved metadata (platform, repo, issue number, ticket content).

### 2. Identify the work surface

Extract from the ticket what needs to change:

- Files, modules, and packages mentioned or implied
- New files or directories that need to be created
- APIs, interfaces, or data structures that are added or modified
- Dependencies that are added, removed, or changed

Verify against the codebase — the ticket may reference things that have moved or no longer exist.

### 3. Assess cross-cutting extent

- How many modules or packages are touched?
- Do changes cross package boundaries?
- Are shared interfaces, types, or data structures affected?
- Are there downstream consumers that need updating?

### 4. Assess decision density

- Does the work follow an established pattern, or does it require new patterns?
- Are there design choices that could go multiple ways?
- Does the work introduce new abstractions, interfaces, or module boundaries?

### 5. Classify

Map the findings to the [complexity classification](../_data/complexity-classification.md) rubric. When characteristics span two levels, prefer the higher level.

### 6. Output

Obtain the base SHA via `git rev-parse --short HEAD`.

```markdown
## Complexity: {ticket title} (#{number})

Assessed at {YYYYMMDD-HHMMSSZ} against {short SHA}

🧩 **Complexity:** {emoji} `{label}`

### Scope

- **Modules affected:** {list of modules or packages touched}
- **New files:** {count and brief description, or "None"}
- **Modified files:** {count and brief description}

### Drivers

- {What pushes the classification to this level}
- {Key factor}

### Risks

- {Known unknowns or complications, or "None identified"}
```

## Verdict mapping

| Level | Label           | Emoji |
| ----- | --------------- | ----- |
| 1     | `trivial`       | ⚪    |
| 2     | `mechanical`    | 🟢    |
| 3     | `involved`      | 🟠    |
| 4     | `architectural` | 🔴    |

## Key principles

- **Evidence over opinion** — every classification must cite specific codebase evidence (file paths, module counts, dependency references)
- **Prefer the higher level** — when characteristics span two levels, classify at the higher one
- **No action, just assessment** — this skill produces output; it does not modify tickets, save artifacts, or post comments
- **Scale to ticket complexity** — a simple ticket gets a brief assessment; a complex ticket with many moving parts gets a thorough one
