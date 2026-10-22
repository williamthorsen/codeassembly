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
- **Data changes**: A change that removes or renames data that deployed code still reads, or that depends on a migration run before merge (see {rulebook:shared-data-conventions})
- **Interfaces**: A change that defines or changes colour tokens, text styles, or a page or UI component (see {rulebook:accessibility-conventions}). For each new or changed interactive element, ask whether it shows that it is interactive, by the states that the rulebook names, and check it in a browser as the rulebook requires rather than by reading the diff alone
- **Conventions**: Adherence to codebase patterns and project standards
- **Edge cases**: Boundary conditions, empty collections, zero values, undefined states
- **Test coverage**: Adequate tests for new functionality; tests that verify behavior and are worth keeping, not just coverage
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

A finding is a proposed change. Name the change before writing the finding: A problem is an observation, not a finding, when you cannot pair it with a change that you would make. Record it as an insight when it contains knowledge that a future reader needs, and drop it otherwise. Naming the change is not settling it: When more than one change would resolve the problem and choosing among them depends on knowledge that the author has, name the alternatives and say the choice is theirs, because the author knows something you do not, never because you could not settle on a fix. Full treatment: [finding scheme § Proposed-change gate](../_data/artifact-conventions.md#proposed-change-gate).

## Actionability gate

A named change still has to be worth making. Hedging language inside a finding ("no action this PR", "not actionable here", "just capturing a thought", "call it out only if X", "would matter once Y") is your own signal that it does not belong; drop it, don't soften it. A finding that endorses the current state and then proposes a change anyway is incoherent; drop it. Self-test: _Would I make this change right now if it were my code?_ If no, it is not a finding. Apply this hardest to R and S. Full treatment, including where dropped content goes: [finding scheme § Actionability gate](../_data/artifact-conventions.md#actionability-gate).

## Insight gate

Reviewers may emit insights (`I{n}`), knowledge worth preserving that is not a finding. An insight must clear a gate as strict as the Actionability gate: Emit it only when it is non-obvious knowledge without which a future reader is materially worse off, and name that benefit. Distinguish it from a Suggestion (`S`): An `S` proposes a change to make now; an `I` records knowledge without an attached action. When an action is implied, it is an `S`, not an insight. Number insights sequentially (`I1`, `I2`, …) in their own sequence, without a severity or an `-L` marker. Full treatment: [knowledge items § Insight gate](../_data/artifact-conventions.md#insight-gate).

## Finding concision

Compose each finding at the tight altitude ([concision principle](../_data/concision.md)): State the defect, its location, and the decision that the author must make, then stop. Cut code already visible to the author, hedged narration, and rationale for why you looked. Every reader spends attention on each line, so weigh each sentence against the decision that it enables, not its completeness.

## Comment findings

Comment text that you propose for a source file (a replacement doc comment, a suggested inline comment) is a source comment, and the full [comment discipline](#comment-discipline) audit applies to it. Prefer a short `todo:` naming what is stale over a rewritten comment, and never copy an example value out of the source.

"Add a comment explaining X" is a finding only when X is a constraint that the code cannot show. Do not request a comment that the discipline would delete.

## Do not recommend a test that is not worth keeping

Every test that you recommend clears the bar in the `testing-conventions` skill, which states the filters and the authoring-side rule. A recommendation that fails a filter is withdrawn rather than reworded, and absence of a test is not by itself a finding.

The commonest instance is a test asserting that deleted code, text, or behavior is absent (a `not.toContain` guard, a `.toBe(false)` on a removed variant). The assertion is noise, not a guard: It encodes history and fails only on a verbatim revert, and such assertions accumulate without limit. The deletion is the fix; the positive assertion describing the replacement behavior is the behavioral guard. This extends the [comment discipline](#comment-discipline) ban on change-history artifacts from comments to test assertions.

## Grown test files

A test file that the change adds to and leaves past the ceiling in the `testing-conventions` skill is a Warning, and its proposed change is a split by aspect as that skill describes. When the file starts expensive setup of its own, such as a database engine, the proposed change shares that setup before the split, so that the split does not add to it. The diff does not show a file's length, so measure each test file that the change adds to. If the project's lint applies `max-lines` to test files, the lint is the guard, and this is not a finding. A file past the ceiling that the change does not add to is Legacy.

## Test placement

Two defects against the placement rules in the `testing-conventions` skill are Warnings:

- **A misplaced expensive example.** The change adds an example at an expensive tier, and a cheaper tier could observe it. The proposed change moves the case to the cheaper tier. If the change's plan or pull-request description explains why a cheaper tier cannot observe the case, it is not a finding.
- **A kept superseded suite.** The change adds cheaper coverage but keeps the higher-tier examples that the new coverage supersedes. The proposed change deletes those examples. To find them, read each process-spawning or full-fixture example that exercises the logic which the change's new tests cover, and compare its assertions with the new tests.

The same defects in tests that the change neither adds nor supersedes are Legacy.

## Database tests and setup cost

Three defects against the database and setup rules in the `testing-conventions` skill are Warnings:

- **A database for a test whose subject is not SQL.** The proposed change tests the logic against a fake client or a mock at the boundary of the module containing the SQL.
- **A test per constraint.** The proposed change deletes it; the test that the migrations apply covers the schema.
- **A split that adds per-file setup.** The change adds or splits a test file, and each file starts its own expensive setup. The proposed change shares that setup across the files.

The same defects in tests that the change does not add, split, or modify are Legacy.

## Test data and timeouts

Two defects against the test-data and timeout rules in the `testing-conventions` skill are Warnings:

- **A raised timeout.** The change raises a hook's, a test's, or a tier's timeout, in a test or in config. The proposed change reduces the work, by the fixes that the skill names: smaller data, injection of what the code reads, and shared setup. A reason stated in the plan or the pull-request description does not exempt the raise: Check the reason against those fixes, and report the finding when one of them still applies.
- **A test that renders or builds production-scale data.** The proposed change passes the smallest data that proves the behavior, and makes the data injectable when the code under test reads it from a module-level singleton, even when the singleton is in code that the change does not touch. The diff does not show the data's size, so read what the code under test imports.

The same defects in tests and config that the change does not add or modify are Legacy.

## Noisy tests

A test that the change adds and that writes output on a passing run is a Suggestion, and its proposed change is the interception that the `testing-conventions` skill describes. The diff does not show runtime output: Read the test run's output when one is available, and otherwise read for logging calls on the paths that the test exercises. A noisy test that the change does not add is Legacy.

## Always-loaded context

A change that adds to what every session loads is a Warning unless nearly every session needs the content, and a ticket that asks for the change does not exempt it. Such a change makes a rulebook ambient, adds an ambient rulebook to a collection or a `codeassembly.yaml` declaration, or grows an `AGENTS.md`, a `CLAUDE.md`, or another file loaded at session start. The proposed change is `skill` or `hook` delivery, or a move of the content into a skill. A skill's or subagent's description is not a finding: Every session needs it to discover what it describes.

## Finding references

Conventions for how findings reference files and code locations.

1. **Repo-relative path required when localizable.** When a finding refers to specific code, the `- **Location:** ` line must be the first bullet under the finding heading, with a repo-relative path. Example: `packages/devtools-panel/config/renderReleaseNotesHtml.ts:69-76`, not `renderReleaseNotesHtml.ts:69-76`.
2. **Multi-range syntax.** Multiple ranges or single lines in the same file concatenate with comma separation, dropping the path on subsequent entries: `path/to/file.ts:42, :69-76, :152-155`.
3. **Multiple files.** Findings that span multiple files use one `- **Location:** ` bullet per file.
4. **Prose may abbreviate after the canonical reference.** Once `Location:` establishes the path, the Description and Recommendation may refer to the file by basename.

## PR comment format

When posting findings as PR comments (e.g., inline comments on a pull request), use a descriptive label instead of the raw finding ID. Finding IDs like `F1` or `W2` are internal to review documents and do not mean anything to readers in PR context.

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
