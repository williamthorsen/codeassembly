---
name: review-criteria
description: Evaluation criteria and finding classification for code review
user-invocable: false
---

# Review criteria

Evaluation criteria for code review. Apply proportionally — match depth to risk.

## Examine

- **Correctness**: logic errors, unhandled error paths, data loss risks
- **Conventions**: adherence to codebase patterns and project standards
- **Edge cases**: boundary conditions, empty collections, zero values, undefined states
- **Test coverage**: adequate tests for new functionality; tests that verify behavior, not just coverage
- **Clarity**: naming, documentation, and instructions convey unambiguous intent
- **Contracts**: documented behaviors match implementations; implicit assumptions are explicit
- **Type safety**: type issues that affect correctness or maintainability
- **Modern patterns**: current best practices over outdated approaches

## Skip

- Lint or formatting issues (automated tools handle these) — e.g., unused imports, missing semicolons, import order, whitespace. Do not create findings for issues that CI linters will catch; at most mention them in passing prose.
- Pre-existing issues in unchanged code (categorize as Legacy if noted)

## Logic verification

- Trace 2–3 concrete examples with realistic inputs through changed code
- Test edge cases: zero values, single vs. multiple items, undefined states
- Watch for variable confusion, context mismatches, assumption violations
- Verify tests reveal logical errors, not just achieve coverage

## Distinguish author work from legacy

Focus findings (F/W/T) only on code authored in the current change — observations in pre-existing code belong in Legacy (suffix `-L`).

## Finding scheme

Findings use the canonical [finding scheme](../_data/artifact-conventions.md#finding-scheme-fwtrs--legacy-suffix) — see that section for the table, category criteria, criticality mapping, and re-review escalation chain.

## PR comment format

When posting findings as PR comments (e.g., inline comments on a pull request), use a descriptive label instead of the raw finding ID. Finding IDs like `F1` or `W2` are internal to review documents and have no meaning to readers in PR context.

| Finding prefix | PR comment label                                                |
| -------------- | --------------------------------------------------------------- |
| `F`            | `fixme:`                                                        |
| `W`            | `warning:`                                                      |
| `T`            | `todo:`                                                         |
| `S`            | `suggestion:`                                                   |
| `R`            | `recommendation:`                                               |
| `-L` suffix    | `legacy {severity}:` (e.g., `legacy fixme:`, `legacy warning:`) |
