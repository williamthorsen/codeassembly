---
name: review-criteria
description: Evaluation criteria and finding classification for code review
user-invocable: false
dependencies:
  skills:
    - anti-patterns
    - testing-conventions
---

# Review criteria

Evaluation criteria for code review. Apply proportionally: Match depth to risk.

## Examine

- **Correctness**: Logic errors, unhandled error paths, data loss risks
- **Conventions**: Adherence to codebase patterns and project standards
- **Edge cases**: Boundary conditions, empty collections, zero values, undefined states
- **Test coverage**: Adequate tests for new functionality; tests that verify behavior and earn their place, not just coverage
- **Clarity**: Naming, documentation, and instructions convey unambiguous intent
- **Contracts**: Documented behaviors match implementations; implicit assumptions are explicit
- **Type safety**: Type issues that affect correctness or maintainability
- **Modern patterns**: Current best practices over outdated approaches

## Skip

- Lint or formatting issues (automated tools handle these), e.g., unused imports, missing semicolons, import order, whitespace. Do not create findings for issues that CI linters will catch; at most mention them in passing prose.
- Author-introduced suppression directives are in scope. A new lint/type suppression added in this change defaults to a Warning (⚠️) unless its rationale demonstrates a legitimate carve-out (see `anti-patterns`). Pre-existing suppressions in unchanged code remain Legacy.
- Pre-existing issues in unchanged code (categorize as Legacy if noted)

## Logic verification

- Trace 2–3 concrete examples with realistic inputs through changed code
- Test edge cases: zero values, single vs. multiple items, undefined states
- Watch for variable confusion, context mismatches, assumption violations
- Verify tests reveal logical errors, not just achieve coverage

## Distinguish author work from legacy

Focus findings (F/W/T) only on code authored in the current change; observations in pre-existing code belong in Legacy (suffix `-L`).

## Finding scheme

Findings use the canonical [finding scheme](../_data/artifact-conventions.md#finding-scheme-fwtrs--legacy-suffix); see that section for the table, category criteria, criticality mapping, and re-review escalation chain.

## Proposed-change gate

A finding is a proposed change. Name the change before writing the finding: A problem you cannot pair with a change you would make is an observation, not a finding. Route it to an insight where it carries knowledge a future reader needs, and drop it otherwise. Naming the change is not settling it: Where more than one change would resolve the problem and choosing among them turns on knowledge the author holds, name the alternatives and say the choice is theirs. Alternatives are named because the author knows something you do not, never because you could not settle on a fix; two offered for want of a decision are one unwritten finding. So a finding has one of exactly two shapes, a single named change or a choice among named alternatives, and only the absence of any envisioned change disqualifies one. Full treatment: [finding scheme § Proposed-change gate](../_data/artifact-conventions.md#proposed-change-gate).

## Actionability gate

A named change still has to be worth making. Hedging language inside a finding ("no action this PR", "not actionable here", "just capturing a thought", "call it out only if X", "would matter once Y") is your own signal that it does not belong; drop it, don't soften it. A finding that endorses the current state and then proposes a change anyway is incoherent; drop it. Self-test: _Would I make this change right now if it were my code?_ If no, it is not a finding. Apply this hardest to R and S. Full treatment, including where dropped content goes: [finding scheme § Actionability gate](../_data/artifact-conventions.md#actionability-gate).

## Insight gate

Reviewers may emit insights (`I{n}`), knowledge worth preserving that is not a finding. An insight must clear a gate as strict as the Actionability gate: Emit it only when it is non-obvious knowledge a future reader is materially worse off without, and name that benefit. Distinguish it from a Suggestion (`S`): An `S` proposes a change to make now; an `I` records knowledge with no action attached. When an action is implied, it is an `S`, not an insight. Number insights sequentially (`I1`, `I2`, …) in their own sequence, with no severity and no `-L` marker. Full treatment: [knowledge items § Insight gate](../_data/artifact-conventions.md#insight-gate).

## Finding concision

Compose each finding at the tight altitude ([concision principle](../_data/concision.md)): State the defect, its location, and the decision the author must make, then stop. Cut code the author can already see, hedged narration, and rationale for why you looked. Every reader pays for each line, so weigh each sentence against the decision it enables, not its completeness.

## Comment findings

Comment text you propose for a source file (a replacement doc comment, a suggested inline comment) is a source comment, and the full [comment discipline](#comment-discipline) audit applies to it. Prefer a short `todo:` naming what is stale over a rewritten comment, and never copy an example value out of the source.

"Add a comment explaining X" is a finding only when X is a constraint the code cannot show. Do not request a comment the discipline would delete.

## Do not recommend a test that does not earn its place

Every test you recommend clears the bar in the `testing-conventions` skill, which states the filters and the authoring-side rule. A recommendation that fails a filter is withdrawn rather than reworded, and absence of a test is not by itself a finding.

The commonest instance is a test asserting that deleted code, text, or behavior is absent (a `not.toContain` guard, a `.toBe(false)` on a removed variant). The assertion is noise, not a guard: It encodes history, fails only on a verbatim revert, and accretes without bound. The deletion is the fix; the positive assertion describing the replacement behavior is the behavioral guard. This extends the [comment discipline](#comment-discipline) ban on change-history artifacts from comments to test assertions.

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

<!-- include: ../../_partials/comment-discipline.md / -->

<!-- guidance-hook: implementation-preferences -->
