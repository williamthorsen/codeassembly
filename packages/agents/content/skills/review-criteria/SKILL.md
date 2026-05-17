---
name: review-criteria
description: Evaluation criteria and finding classification for code review
user-invocable: false
---

# Review criteria

Evaluation criteria for code review. Apply proportionally — match depth to risk.

## Examine

- **Correctness**: Logic errors, unhandled error paths, data loss risks
- **Conventions**: Adherence to codebase patterns and project standards
- **Edge cases**: Boundary conditions, empty collections, zero values, undefined states
- **Test coverage**: Adequate tests for new functionality; tests that verify behavior, not just coverage
- **Clarity**: Naming, documentation, and instructions convey unambiguous intent
- **Contracts**: Documented behaviors match implementations; implicit assumptions are explicit
- **Type safety**: Type issues that affect correctness or maintainability
- **Modern patterns**: Current best practices over outdated approaches

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

## Finding references

Conventions for how findings reference files and code locations.

1. **Repo-relative path required when localizable.** When a finding refers to specific code, the `- **Location:** ` line must be the first bullet under the finding heading, with a repo-relative path. Example: `packages/devtools-panel/config/renderReleaseNotesHtml.ts:69-76`, not `renderReleaseNotesHtml.ts:69-76`.
2. **Multi-range syntax.** Multiple ranges or single lines in the same file concatenate with comma separation, dropping the path on subsequent entries: `path/to/file.ts:42, :69-76, :152-155`.
3. **Multiple files.** Findings that span multiple files use one `- **Location:** ` bullet per file.
4. **Prose may abbreviate after the canonical reference.** Once `Location:` establishes the path, the Description and Recommendation may refer to the file by basename.

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
