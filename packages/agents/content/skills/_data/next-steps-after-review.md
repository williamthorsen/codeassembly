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
| 2   |       | Leave as-is   | Accept the deviation without updating the ticket     |

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
  2. ■□□ Leave as-is:
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

| #   | Emoji | Option             | Description                                    |
| --- | ----- | ------------------ | ---------------------------------------------- |
| 1   | 🧠    | Design and plan    | Rethink the approach before fixing             |
| 2   | 🎶    | Orchestrate        | Run the full orchestrated development pipeline |
| 3   | 🚀    | Implement directly | Implement fixes without orchestration          |

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
     ➖ longer wall time and higher token spend.
     Clear context and use the `orchestrate-dev` skill with ticket: {ticket_source}
  3. 🚀 ■□□ Implement directly:
     ➕ fastest path when findings are localized and obvious;
     ➖ no independent review pass.
```

Options that invoke a skill include context-clearing guidance:

- **Design and plan** and **Orchestrate**: Prepend "Clear context and use..." because the plan/ticket artifact is self-contained and orchestration dispatches fresh subagents.
- **Implement directly**: No "Clear context" prefix; conversation history is valuable for manual implementation.

Skill names for each option:

- 🧠 **Design and plan** -> `design-and-plan`
- 🎶 **Orchestrate** -> `orchestrate-dev`
- 🚀 **Implement directly** -> no skill invocation; the user implements manually or asks the agent to begin

### Recommendation rules

Select the recommended option using these rules in priority order. The selected option carries the ■■□ marker in the rendered output; the other two options carry ■□□ by default. Downgrade to □□□ only when a specific alternative carries a clear drawback in the current context.

1. **Design and plan** -- findings suggest the approach needs rethinking — [complexity level 4](complexity-classification.md) (e.g., architectural issues, fundamental design problems, multiple FIXMEs that point to a flawed strategy)
2. **Orchestrate** -- findings are non-trivial but the approach is sound — [complexity level 3](complexity-classification.md) (e.g., a mix of warnings and TODOs, or FIXMEs that are localized fixes)
3. **Implement directly** -- findings fall at [complexity levels 1–2](complexity-classification.md) (e.g., a few TODOs, minor warnings with obvious fixes)

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
  2. ■□□ Leave as-is:
     ➕ ships faster;
     ➖ ticket drifts from reality.

Actionable findings:
  1. 🧠 ■□□ Design and plan:
     ➕ resets the approach when findings indicate the strategy is off;
     ➖ heaviest path; reuses work only if the plan changes substantively.
     Clear context and use the `design-and-plan` skill with ticket: {ticket_source}
  2. 🎶 ■■□ Orchestrate:
     ➕ structured review pass on a fresh context;
     ➖ longer wall time and higher token spend.
     Clear context and use the `orchestrate-dev` skill with ticket: {ticket_source}
  3. 🚀 ■□□ Implement directly:
     ➕ fastest path when findings are localized and obvious;
     ➖ no independent review pass.
```
