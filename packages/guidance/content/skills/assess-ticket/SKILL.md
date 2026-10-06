---
name: assess-ticket
description: Assess a ticket against the current codebase for drift, relevance, progress, advisability, and complexity, and prompt for follow-up actions
user-invocable: true
---

# Assess ticket

Assess a ticket against the current codebase across five dimensions: drift, relevance, progress, advisability, and complexity. Produces a structured assessment with constrained verdicts and supporting evidence.

**Announce at start:** "Using assess-ticket to assess {ticket reference} (mode: {mode})."

## Arguments

- **Ticket source** (optional): Issue URL, shorthand reference (`#99`, `issue 99`), file path, or plain text. When omitted, auto-resolved from the environment (see [ticket source resolution](../_data/ticket-source-resolution.md#auto-resolve)).
- **Mode** (optional): `drift`, `relevance`, `progress`, `advisability`, `complexity`, or `all` (default: `all`)

## Process

### 1. Resolve ticket source

Resolve the ticket source using the [ticket source resolution](../_data/ticket-source-resolution.md) table. Request the `updatedAt` field for temporal analysis, and the ticket's child counts (on GitHub, `subIssuesSummary`) for the umbrella case in [Baseline verdicts](#baseline-verdicts). Store the resolved metadata (platform, repo, issue number, last-updated date, child counts, ticket content). Never treat a ticket source without child counts, such as plain text or a file, as an umbrella. When the source resolves to a URL, persist it to the branch manifest per [Stored ticket URL](../_data/ticket-source-resolution.md#stored-ticket-url) so that a later session does not need a ticket argument.

### 2. Investigate

Run the investigation for the requested mode, or for every dimension when mode is `all`, per [Assessment procedure](#assessment-procedure).

### 3. Output

Format the assessment per [Output format](#output-format). When a single mode is requested, output only that dimension's section (with the header and provenance line). When mode is `all`, output all dimensions in order, omitting both advisability and complexity when progress is `complete`.

Obtain the base SHA via `git rev-parse --short HEAD`.

### 4. Next steps

After presenting the assessment output, evaluate whether any verdicts are non-baseline and, if so, present follow-up actions. Follow [next steps after assessment](next-steps-after-assessment.md) for the verdict-to-actions mapping, combination rules, and interaction protocol, and [Baseline verdicts](#baseline-verdicts) for the baseline definition.

<!-- include: ../_partials/action-items.md / -->

## Assessment procedure

<!-- include: ../../_partials/ticket-assessment.md / -->

## Key principles

- **Assessment first, action on request**: Lead with the assessment; offer follow-up actions but do not execute without user selection
