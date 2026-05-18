# Next steps after review

Standard next-steps block for skills that produce a code review. Skills reference this file to maintain a consistent format and recommendation logic.

The next-steps block has three independent sub-blocks. Each is shown only when its condition is met. If no condition is met, no next-steps block appears. Whatever combination of sub-blocks is shown, always wrap the output in a `Next steps:` header.

Use `~/`-relative paths where possible and absolute paths otherwise.

## Deviations sub-block

Shown when the ticket compliance section reports gaps (partial or unaddressed acceptance criteria) or unplanned work.

### Options

| #   | Emoji | Option        | Description                                          |
| --- | ----- | ------------- | ---------------------------------------------------- |
| 1   | 📝    | Update ticket | Revise the ticket to match the actual implementation |
| 2   | ⏭️    | Leave as-is   | Accept the deviation without updating the ticket     |

### Output format

Render the list in [recommendation-gradient](./recommendation-gradient.md) form. Each option carries a marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which markers apply. Pros and cons are omitted by default — add a `➕` or `➖` line only when the specific deviation presents a context-specific tradeoff (e.g., "the missing AC was load-bearing for downstream tests"). Generic restatements ("ships faster," "ticket drifts from reality") are noise and must be omitted; see the [recommendation gradient's don'ts](./recommendation-gradient.md#donts) for the rule.

Example (rendered for the recommendation case):

```
Next steps:

Deviations from ticket:
1. 📝 ■■□ Update ticket:
   Use the `design-and-plan` skill with ticket: {ticket_source}
2. ⏭️ ■□□ Leave as-is
```

When the recommendation rules indicate no preference, omit markers from both options per the gradient's pure-taste-call form.

### Recommendation rules

1. **Recommend "Update ticket"** (■■□ on Update ticket, ■□□ on Leave as-is): acceptance criteria are missing or substantially different from what was implemented, OR significant unplanned work was done that should be captured.
2. **No recommendation** (omit markers from both options): deviations are minor and intentional (e.g., a criterion was addressed differently than originally described but the intent is met). The user decides.

When uncertain, recommend updating the ticket.

## Source divergence sub-block

Shown when the consistency section of the review reports a `partial` or `severe` verdict. The option set varies by case (which spec source the implementation matches, drawn from the consistency-section table — see `review-branch/SKILL.md` § Specification consistency).

### Options

The base option pool is:

| Emoji | Option                           | Action                                                                                    |
| ----- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| 📝    | Update PR description            | Edit the PR description to match the implementation                                       |
| 📝    | Update ticket                    | Use `align-ticket-with-implementation` to ratify the implementation as the ticket's truth |
| 📝    | Update ticket and PR description | Use `align-ticket-with-implementation`, then edit the PR description as a separate step   |
| 🧠    | Revisit design                   | Use `design-and-plan` to reconcile the implementation and specs                           |
| ⏭️    | Leave as-is                      | Accept the divergence                                                                     |

Each case renders three of these options; the specific options and their ordering are shown in the Output format section.

### Output format

Render the list in [recommendation-gradient](./recommendation-gradient.md) form. Each option carries a marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option earns the strongest marker per case. Pros and cons are omitted by default — add a `➕` or `➖` line only when the specific divergence presents a context-specific tradeoff (e.g., "the diverging AC was load-bearing for adjacent work that has already shipped"). Generic restatements are noise and must be omitted; see the [recommendation gradient's don'ts](./recommendation-gradient.md#donts) for the rule.

Case 2 — implementation matches ticket; PR description is the stale source:

```
Source divergence:
1. 📝 ■■□ Update PR description:
   Edit the PR description to match the implementation, which matches the ticket.
2. 🧠 ■□□ Revisit design:
   Use the `design-and-plan` skill with ticket: {ticket_source}
3. ⏭️ ■□□ Leave as-is
```

Case 3 — implementation matches PR description; ticket is the stale source:

```
Source divergence:
1. 📝 ■■□ Update ticket:
   Use the `align-ticket-with-implementation` skill to ratify the implementation as the ticket's source of truth.
2. 🧠 ■□□ Revisit design:
   Use the `design-and-plan` skill with ticket: {ticket_source}
3. ⏭️ ■□□ Leave as-is
```

Case 4 — implementation matches neither source (severe):

```
Source divergence:
1. 🧠 ■■□ Revisit design:
   Use the `design-and-plan` skill with ticket: {ticket_source}; the implementation diverged from both specs, so reconciliation is needed.
2. 📝 ■□□ Update ticket and PR description:
   Use the `align-ticket-with-implementation` skill to ratify the implementation as the new shared source of truth (edit the PR description as a separate step).
3. ⏭️ ■□□ Leave as-is
```

Source-divergence options preserve conversation context because the divergence diagnosis from the review is the seed for whichever reconciliation action is taken.

### Recommendation rules

In the typical flow, the ticket is written first and rarely revised, while the PR description describes the implementation as built. When the two diverge and the implementation matches one of them, the unmatched source is the stale one — update it to match reality. When the implementation matches neither, `design-and-plan` is the corrective: it handles both reconciliation cases (drift was intentional → ratify in the ticket; drift was unintended → plan against current reality with the existing code as material).

Determine the case from the implementation column of the consistency-section table:

| Implementation column shows                   | Verdict      | Case | Recommended option    |
| --------------------------------------------- | ------------ | ---- | --------------------- |
| `🟢 ticket, 🟠/🔴 PR` on every divergent row  | 🟠 `partial` | 2    | Update PR description |
| `🟠/🔴 ticket, 🟢 PR` on every divergent row  | 🟠 `partial` | 3    | Update ticket         |
| `🟠/🔴 ticket, 🟠/🔴 PR` on any divergent row | 🔴 `severe`  | 4    | Revisit design        |

### Marker strengths

The recommended option carries the ■■□ marker. Other options carry ■□□ by default. Reserve □□□ for an alternative with a clear drawback in the current context. Reserve ■■■ for the recommended option only when you would actively push back against any other choice. See [recommendation-gradient markers](./recommendation-gradient.md#markers) for the full marker table and worked examples of the ■■■ and □□□ cases.

## Findings sub-block

Shown when the review contains actionable findings (F, W, or T categories).

### Options

| #   | Emoji | Option                                   | Description                                                                    |
| --- | ----- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | 🧠    | Design and plan                          | Rethink the approach before fixing                                             |
| 2   | 🎶    | Orchestrate                              | Run the full orchestrated development pipeline                                 |
| 3   | 🚀🔍  | Implement directly with follow-up review | Fix the findings, then run a single end-of-work review pass as a separate step |
| 4   | 🚀    | Implement directly                       | Fix the findings without a follow-up review (reserved for trivial findings)    |

### Output format

Render the list in [recommendation-gradient](./recommendation-gradient.md) form. Each option carries a marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option earns the strongest marker. Pros and cons are omitted by default — add a `➕` or `➖` line only when the specific findings present a context-specific tradeoff bearing on which option fits (e.g., "fixes touch three modules with downstream effects"). Generic option properties ("structured review pass," "longer wall time") are noise and must be omitted; see the [recommendation gradient's don'ts](./recommendation-gradient.md#donts) for the rule. Include all known paths (ticket) in each option line; omit paths that are not available in the current context.

Example (rendered for the default case, where the recommendation rules below select Orchestrate):

```
Next steps:

Actionable findings:
1. 🧠 ■□□ Design and plan:
   Clear context and use the `design-and-plan` skill with ticket: {ticket_source}
2. 🎶 ■■□ Orchestrate:
   Clear context and use the `orchestrate-dev` skill with ticket: {ticket_source}
3. 🚀🔍 ■□□ Implement directly with follow-up review:
   Implement directly, then clear context and use the `review-branch` skill with ticket: {ticket_source}
4. 🚀 ■□□ Implement directly
```

Options that invoke a skill include context-clearing guidance:

- **Design and plan** and **Orchestrate**: Prepend "Clear context and use..." because the plan/ticket artifact is self-contained and orchestration dispatches fresh subagents.
- **Implement directly with follow-up review** and **Implement directly**: No "Clear context" prefix; conversation history is valuable for manual implementation. The follow-up-review variant adds a separate `review-branch` step after fixes are made.

Skill names for each option:

- 🧠 **Design and plan** -> `design-and-plan`
- 🎶 **Orchestrate** -> `orchestrate-dev`
- 🚀🔍 **Implement directly with follow-up review** -> no fix-time skill invocation; implement fixes manually, then run `review-branch` (or `orchestrate-review`) as a separate post-implementation step
- 🚀 **Implement directly** -> no skill invocation; implement fixes manually or ask the agent to begin

### Recommendation rules

Select the recommended option by checking these rules in order and stopping at the first match.

1. **Design and plan** — findings suggest the approach needs rethinking ([complexity level 4](complexity-classification.md)): architectural issues, fundamental design problems, or multiple FIXMEs that point to a flawed strategy.
2. **Implement directly with follow-up review** — findings are localized and a single end-of-work review pass would verify the fixes: single module/package, fixes are bounded, no downstream effects expected. The default for most actionable findings ([complexity level 3 bounded](complexity-classification.md), or non-trivial findings at levels 1–2).
3. **Implement directly** — findings are trivial enough that a re-review would catch nothing meaningful (e.g., a single typo fix, unused-import removal). [Complexity levels 1–2 trivial only](complexity-classification.md).
4. **Orchestrate** — all other cases (default). Findings are non-trivial AND cross-cutting ([complexity level 3 with downstream effects](complexity-classification.md), or a mix of warnings and TODOs that span multiple modules).

### Marker strengths

The selected option carries the ■■□ marker in the rendered output. The other three options carry ■□□ by default. Reserve □□□ for an alternative with a clear drawback in the current context. Reserve ■■■ for the selected option only when you would actively push back against any other choice. See [recommendation-gradient markers](./recommendation-gradient.md#markers) for the full marker table and worked examples of the ■■■ and □□□ cases.

Complexity levels classify individual findings, but the recommendation applies to the collection. Multiple low-level findings that together indicate a design flaw may warrant a higher recommendation than any single finding's level suggests. When uncertain between two options, recommend the more thorough one.

Each skill supplies its own recommendation context (e.g., finding counts and categories, severity of deviations). Apply these rules using that context.

See [`ticket-creation-cost.md`](ticket-creation-cost.md) for the cost-aware disposition that governs whether a deferred finding becomes a separate ticket, joins a batch, or ships as a drive-by. The recommendation rules above pick the _implementation skill_; the cost reference applies to any finding that the user defers rather than addressing immediately.

## Combined output format

When multiple sub-blocks are shown, present them as separate sections within a single next-steps block. Ordering is Deviations → Source divergence → Actionable findings. The example below illustrates one possible arrangement; the recommendation rules in each sub-block determine which marker applies to each option:

```
Next steps:

Deviations from ticket:
1. 📝 ■■□ Update ticket:
   Use the `design-and-plan` skill with ticket: {ticket_source}
2. ⏭️ ■□□ Leave as-is

Source divergence:
1. 📝 ■■□ Update ticket:
   Use the `align-ticket-with-implementation` skill to ratify the implementation as the ticket's source of truth.
2. 🧠 ■□□ Revisit design:
   Use the `design-and-plan` skill with ticket: {ticket_source}
3. ⏭️ ■□□ Leave as-is

Actionable findings:
1. 🧠 ■□□ Design and plan:
   Clear context and use the `design-and-plan` skill with ticket: {ticket_source}
2. 🎶 ■■□ Orchestrate:
   Clear context and use the `orchestrate-dev` skill with ticket: {ticket_source}
3. 🚀🔍 ■□□ Implement directly with follow-up review:
   Implement directly, then clear context and use the `review-branch` skill with ticket: {ticket_source}
4. 🚀 ■□□ Implement directly
```
