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

## Finding scheme (F/W/T/R/S/L)

See [artifact conventions](_data/artifact-conventions.md#finding-scheme-fwtrsl) for the canonical reference.

Used by review-producing skills and agents for structured code review findings. Every finding (F/W/T/R/S) must include a concrete action the author can take. Non-actionable observations belong in prose sections (e.g., Technical Assessment), not in numbered findings.

| ID     | Category       | Severity       | Merge-blocking?                                                    |
| ------ | -------------- | -------------- | ------------------------------------------------------------------ |
| `F{n}` | FIXME          | critical       | Yes — must fix before merge                                        |
| `W{n}` | Warning        | warning        | May block — questionable decisions requiring justification         |
| `T{n}` | TODO           | todo           | No — should fix, can wait for next PR                              |
| `R{n}` | Recommendation | recommendation | No — advisable but discretionary                                   |
| `S{n}` | Suggestion     | suggestion     | No — optional improvement                                          |
| `L{n}` | Legacy         | legacy         | No — observation in pre-existing code, not authored in this branch |

### Category criteria

**FIXME (F)** — must fix before merge:

- Bugs: incorrect logic, unhandled error paths, data loss risks
- Security: injection, auth bypass, exposed secrets
- Contract violations: breaking API changes, type unsafety
- Test failures: tests that don't pass or don't test what they claim

**Warning (W)** — questionable, may block merge:

- Missing edge case handling that could cause runtime errors
- Convention violations that affect maintainability
- Decisions that seem wrong but may be intentional (require justification)

**TODO (T)** — should fix, not in this PR:

- Missing or inadequate tests for new functionality
- Performance issues with measurable impact
- Incomplete error handling that won't cause immediate failures

**Recommendation (R)** — advisable but discretionary:

- Better patterns available in the codebase
- Opportunities to reduce complexity
- Architectural improvements worth considering

**Suggestion (S)** — optional improvement:

- Better naming or code organization
- Additional test cases for edge cases
- Documentation improvements

**Legacy (L)** — pre-existing code observation:

- Issues in code not authored in this branch
- Frame as future opportunities, not current defects
- Never count against the review score

### Overall criticality mapping

| Findings present                   | Criticality | Meaning                                      |
| ---------------------------------- | ----------- | -------------------------------------------- |
| None, or only S/R/L                | `none`      | Ready to merge                               |
| W and/or T, but no F               | `low`       | Acceptable to merge with optional follow-ups |
| 1–2 F (straightforward), or many W | `medium`    | Needs fixes but approach is sound            |
| Multiple F, or structural issues   | `high`      | Needs significant rework                     |

### Re-review severity escalation

`S → R → T → W → F`. L findings are never escalated.
