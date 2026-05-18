# Next steps after review

Standard next-steps block for skills that produce a code review. Skills reference this file to maintain a consistent format and recommendation logic.

The next-steps block has two independent sub-blocks. Each is shown only when its condition is met. If neither condition is met, no next-steps block appears. Whether one or both sub-blocks are shown, always wrap the output in a `Next steps:` header.

Use `~/`-relative paths where possible and absolute paths otherwise.

## Deviations sub-block

Shown when the ticket compliance section reports gaps (partial or unaddressed acceptance criteria) or unplanned work.

### Options

| #   | Emoji | Option        | Description                                          |
| --- | ----- | ------------- | ---------------------------------------------------- |
| 1   | 📝    | Update ticket | Revise the ticket to match the actual implementation |
| 2   | ⏭️    | Leave as-is   | Accept the deviation without updating the ticket     |

### Output format

Render the list in [recommendation-gradient](./recommendation-gradient.md) form: each option carries a marker (■■■/■■□/■□□/□□□) and one or two `➕` pro / `➖` con lines. The recommendation rules below determine which markers apply.

Example (rendered for the recommendation case):

```
Next steps:

Deviations from ticket:
1. 📝 ■■□ Update ticket:
   ➕ keeps the ticket as the source of truth for what was built;
   ➖ adds a step before merging.
   Use the `design-and-plan` skill with ticket: {ticket_source}
2. ⏭️ ■□□ Leave as-is:
   ➕ ships faster;
   ➖ ticket drifts from reality.
```

When the recommendation rules indicate no preference, omit markers from both options per the gradient's pure-taste-call form; the pros/cons lines remain.

### Recommendation rules

1. **Recommend "Update ticket"** (■■□ on Update ticket, ■□□ on Leave as-is): acceptance criteria are missing or substantially different from what was implemented, OR significant unplanned work was done that should be captured.
2. **No recommendation** (omit markers from both options): deviations are minor and intentional (e.g., a criterion was addressed differently than originally described but the intent is met). The user decides.

When uncertain, recommend updating the ticket.

## Findings sub-block

Shown when the review contains actionable findings (F, W, or T categories).

### Options

| #   | Emoji | Option                                   | Description                                                                    |
| --- | ----- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | 🧠    | Design and plan                          | Rethink the approach before fixing                                             |
| 2   | 🎶    | Orchestrate                              | Run the full orchestrated development pipeline                                 |
| 3   | 🔍    | Implement directly with follow-up review | Fix the findings, then run a single end-of-work review pass as a separate step |
| 4   | 🚀    | Implement directly                       | Fix the findings without a follow-up review (reserved for trivial findings)    |

### Output format

Render the list in [recommendation-gradient](./recommendation-gradient.md) form: each option carries a marker (■■■/■■□/■□□/□□□) and one or two `➕` pro / `➖` con lines. The recommendation rules below determine which option earns the strongest marker. Include all known paths (ticket) in each option line; omit paths that are not available in the current context.

Example (rendered for the default case, where the recommendation rules below select Orchestrate):

```
Next steps:

Actionable findings:
1. 🧠 ■□□ Design and plan:
   ➕ resets the approach when findings indicate the strategy is off;
   ➖ heaviest path; reuses work only if the plan changes substantively.
   Clear context and use the `design-and-plan` skill with ticket: {ticket_source}
2. 🎶 ■■□ Orchestrate:
   ➕ structured review pass on a fresh context;
   ➕ best when the findings' fixes span multiple modules or have downstream effects;
   ➖ longer wall time and higher token spend.
   Clear context and use the `orchestrate-dev` skill with ticket: {ticket_source}
3. 🔍 ■□□ Implement directly with follow-up review:
   ➕ pairs localized fixes with one targeted review pass to verify the corrections;
   ➕ keeps fix context warm; resets to a fresh context for the review.
   Implement directly, then clear context and use the `review-branch` skill with ticket: {ticket_source}
4. 🚀 ■□□ Implement directly:
   ➕ shortest path for trivial findings (typo fix, unused-import removal) where a re-review would catch nothing;
   ➖ unsuitable for findings whose fixes would benefit from review.
```

Options that invoke a skill include context-clearing guidance:

- **Design and plan** and **Orchestrate**: Prepend "Clear context and use..." because the plan/ticket artifact is self-contained and orchestration dispatches fresh subagents.
- **Implement directly with follow-up review** and **Implement directly**: No "Clear context" prefix; conversation history is valuable for manual implementation. The follow-up-review variant adds a separate `review-branch` step after fixes are made.

Skill names for each option:

- 🧠 **Design and plan** -> `design-and-plan`
- 🎶 **Orchestrate** -> `orchestrate-dev`
- 🔍 **Implement directly with follow-up review** -> no fix-time skill invocation; implement fixes manually, then run `review-branch` (or `orchestrate-review`) as a separate post-implementation step
- 🚀 **Implement directly** -> no skill invocation; implement fixes manually or ask the agent to begin

### Recommendation rules

Select the recommended option by checking these rules in order and stopping at the first match.

1. **Design and plan** — findings suggest the approach needs rethinking ([complexity level 4](complexity-classification.md)): architectural issues, fundamental design problems, or multiple FIXMEs that point to a flawed strategy.
2. **Implement directly with follow-up review** — findings are localized and a single end-of-work review pass would verify the fixes: single module/package, fixes are bounded, no downstream effects expected. The default for most actionable findings ([complexity level 3 bounded](complexity-classification.md), or non-trivial findings at levels 1–2).
3. **Implement directly** — findings are trivial enough that a re-review would catch nothing meaningful (e.g., a single typo fix, unused-import removal). [Complexity levels 1–2 trivial only](complexity-classification.md).
4. **Orchestrate** — all other cases (default). Findings are non-trivial AND cross-cutting ([complexity level 3 with downstream effects](complexity-classification.md), or a mix of warnings and TODOs that span multiple modules).

### Marker strengths

The selected option carries the ■■□ marker in the rendered output. The other three options carry ■□□ by default. Reserve □□□ for an alternative with a clear drawback in the current context. Reserve ■■■ for the selected option only when you would actively push back against any other choice.

Complexity levels classify individual findings, but the recommendation applies to the collection. Multiple low-level findings that together indicate a design flaw may warrant a higher recommendation than any single finding's level suggests. When uncertain between two options, recommend the more thorough one.

Each skill supplies its own recommendation context (e.g., finding counts and categories, severity of deviations). Apply these rules using that context.

See [`ticket-creation-cost.md`](ticket-creation-cost.md) for the cost-aware disposition that governs whether a deferred finding becomes a separate ticket, joins a batch, or ships as a drive-by. The recommendation rules above pick the _implementation skill_; the cost reference applies to any finding that the user defers rather than addressing immediately.

## Combined output format

When both sub-blocks are shown, present them as separate sections within a single next-steps block. The example below illustrates one possible arrangement; the recommendation rules in each sub-block determine which marker applies to each option:

```
Next steps:

Deviations from ticket:
1. 📝 ■■□ Update ticket:
   ➕ keeps the ticket as the source of truth for what was built;
   ➖ adds a step before merging.
   Use the `design-and-plan` skill with ticket: {ticket_source}
2. ⏭️ ■□□ Leave as-is:
   ➕ ships faster;
   ➖ ticket drifts from reality.

Actionable findings:
1. 🧠 ■□□ Design and plan:
   ➕ resets the approach when findings indicate the strategy is off;
   ➖ heaviest path; reuses work only if the plan changes substantively.
   Clear context and use the `design-and-plan` skill with ticket: {ticket_source}
2. 🎶 ■■□ Orchestrate:
   ➕ structured review pass on a fresh context;
   ➕ best when the findings' fixes span multiple modules or have downstream effects;
   ➖ longer wall time and higher token spend.
   Clear context and use the `orchestrate-dev` skill with ticket: {ticket_source}
3. 🔍 ■□□ Implement directly with follow-up review:
   ➕ pairs localized fixes with one targeted review pass to verify the corrections;
   ➕ keeps fix context warm; resets to a fresh context for the review.
   Implement directly, then clear context and use the `review-branch` skill with ticket: {ticket_source}
4. 🚀 ■□□ Implement directly:
   ➕ shortest path for trivial findings (typo fix, unused-import removal) where a re-review would catch nothing;
   ➖ unsuitable for findings whose fixes would benefit from review.
```
