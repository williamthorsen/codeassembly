---
name: review-criteria
description: Evaluation criteria for code review — what to examine and what to skip
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

- Lint or formatting issues (automated tools handle these)
- Pre-existing issues in unchanged code (categorize as Legacy if noted)

## Logic verification

- Trace 2–3 concrete examples with realistic inputs through changed code
- Test edge cases: zero values, single vs. multiple items, undefined states
- Watch for variable confusion, context mismatches, assumption violations
- Verify tests reveal logical errors, not just achieve coverage

## Distinguish author work from legacy

- Focus findings (F/W/T) only on code authored in the current change
- Frame observations in pre-existing code as Legacy (L), not defects
