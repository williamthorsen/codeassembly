# Complexity classification

Classify the complexity of a task, finding, or change to determine how it should be handled. Skills reference this rubric to make consistent routing and triage decisions.

## Levels

| Level | Label             | Characteristics                                                                                                   |
| ----- | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1     | **Trivial**       | Single-line or purely mechanical. No judgment needed. The fix is obvious from the description alone.              |
| 2     | **Mechanical**    | Follows an obvious pattern. Single module, no API or behavioral changes. A competent agent's first pass suffices. |
| 3     | **Involved**      | Requires understanding context. Touches multiple files or modules. May involve design decisions.                  |
| 4     | **Architectural** | Cross-cutting concerns, new patterns, dependency boundary changes, or far-reaching consequences.                  |

### Level 1: Trivial

- Remove unused import
- Fix typo in error message or variable name
- Add missing return type that the compiler can infer
- Delete dead code already flagged by a linter

### Level 2: Mechanical

- Rename a local function or variable across its usages within a single module
- Add a missing test case that follows an existing test pattern
- Extract a repeated literal into a named constant
- Update a reference path after a file was moved

### Level 3: Involved

- Refactor retry logic to use a shared utility
- Add error handling for a new edge case that requires understanding the call chain
- Modify a data structure shared between modules
- Implement a feature that follows an established pattern but spans multiple files

### Level 4: Architectural

- Introduce a new subsystem or module boundary
- Change how modules communicate (new interfaces, events, or protocols)
- Modify dependency boundaries (add/remove/replace libraries)
- Restructure control flow or state management across components

## Consumer levels

Each consuming skill defines which complexity levels qualify for its "simple enough" decision against this rubric.

| Consumer                           | Levels | Decision                                                                                                                                                                                                |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrap-up` drive-by pass            | 1–2    | Apply immediately on the current branch; skip ticket creation                                                                                                                                           |
| `next-steps-after-plan`            | 1–2    | Recommend "Implement". When a review pass would catch nothing meaningful (e.g., a typo or unused-import removal), note on the option that the review can be skipped at `implement-plan`'s closing menu. |
| `implement-plan` closing menu      | 1–2    | Recommend "Create PR without review" — the realized diff is trivial enough that a review pass would catch nothing meaningful                                                                            |
| `next-steps-after-review`          | 1–2    | Trivial findings are usually determinate, which is what selects "Implement directly"; the recommendation turns on determinacy rather than on the level.                                                 |
| `orchestrated-architect` (planned) | 1–2    | Classify as `none`/`low` impact (minimal architectural guidance)                                                                                                                                        |

When characteristics span two levels, prefer the higher level. This is consistent with the "when uncertain, recommend the more thorough option" pattern used by consuming skills.

Consumers above level 2 should use the level descriptions to inform their own routing logic rather than relying solely on this table.

The complexity rubric and the [scope-and-deferral](scope-and-deferral.md) model compose: Complexity drives orchestration-routing decisions (which skill picks the work up next), while scope-and-deferral drives the fold-in-vs-spin-off decision (whether the work needs its own ticket at all).
