# Next steps after plan

Standard next-steps block for skills that produce or refine an implementation plan. Skills reference this file to maintain a consistent format and recommendation logic.

## Options

| #   | Emoji | Option                                   | Description                                                             |
| --- | ----- | ---------------------------------------- | ----------------------------------------------------------------------- |
| 1   | 🧠    | Refine plan                              | Review the plan for completeness and correctness                        |
| 2   | 🎶    | Orchestrate                              | Run the full orchestrated development pipeline                          |
| 3   | 🔍    | Implement directly with follow-up review | Implement, then run a single end-of-work review pass as a separate step |
| 4   | 🚀    | Implement directly                       | Implement without a follow-up review (reserved for trivial work)        |

## Output format

Present all four options as a numbered list in [recommendation-gradient](./recommendation-gradient.md) form: each option carries a strength marker (■■■/■■□/■□□/□□□) and one or two `➕` pro / `➖` con lines. The recommendation rules below determine which option earns the strongest marker. Include all known paths (plan, ticket) in each option line; omit paths that are not available in the current context. Use `~/`-relative paths where possible and absolute paths otherwise.

Options that invoke a skill include context-clearing guidance:

- **Refine plan** and **Orchestrate**: Prepend "Clear context and use..." because the plan artifact is self-contained and orchestration dispatches fresh subagents; prior conversation wastes tokens and can introduce bias.
- **Implement directly with follow-up review** and **Implement directly**: No "Clear context" prefix; conversation history is valuable for manual implementation. The follow-up-review variant adds a separate `review-branch` step after implementation.

Example (rendered for the default case, where the recommendation rules below select Orchestrate):

```
Next steps:
1. 🧠 ■□□ Refine plan:
   ➕ catches structural issues before implementation;
   ➖ adds another round when the plan is already precise.
   Clear context and use the `refine-plan` skill with
   plan: {plan_path},
   ticket: {ticket_source}
2. 🎶 ■■□ Orchestrate:
   ➕ structured review pass on a fresh context;
   ➕ best when the work's consequences ripple beyond the immediate change site;
   ➖ longer wall time and higher token spend.
   Clear context and use the `orchestrate-dev` skill with
   plan: {plan_path},
   ticket: {ticket_source}
3. 🔍 ■□□ Implement directly with follow-up review:
   ➕ pairs bounded single-package work with one targeted review pass;
   ➕ keeps implementation context warm; resets to a fresh context for the review.
   Implement directly, then clear context and use the `review-branch` skill with
   ticket: {ticket_source}
4. 🚀 ■□□ Implement directly:
   ➕ shortest path for genuinely trivial work (typo, unused-import removal, single-file mechanical rename);
   ➖ unsuitable for work whose consequences would benefit from review.
```

Skill names for each option:

- 🧠 **Refine plan** -> `refine-plan`
- 🎶 **Orchestrate** -> `orchestrate-dev`
- 🔍 **Implement directly with follow-up review** -> no plan-time skill invocation; implement manually, then run `review-branch` (or `orchestrate-review`) as a separate post-implementation step
- 🚀 **Implement directly** -> no skill invocation; implement manually or ask the agent to begin

## Recommendation rules

Select the recommended option by checking these rules in order and stopping at the first match.

1. **Refine plan** — recommend when both of the following are true:

   The plan involves any of:
   - Changes to dependency boundaries (which libraries are used, which APIs are consumed, or how they're configured)
   - Changes to the shape or semantics of behavioral contracts or data structures
   - Far-reaching downstream consequences
   - Changes to control flow, state management, or execution order
   - Introduction of new interfaces, modules, or subsystems

   AND either of:
   - The plan has not been previously refined
   - A prior iteration of `refine-plan` resulted in significant alteration of the plan or significant expansion of the scope of the changes required to implement the plan

2. **Implement directly with follow-up review** — recommend when the work's verification surface fits a single end-of-work review pass: single module/package, the plan is precise (or follows an established pattern closely), and the implementation's consequences are bounded enough that compiler + tests + one review pass would catch the meaningful classes of mistake.
3. **Implement directly** — recommend instead of rule 2 when the work is trivial enough that a review pass would catch nothing meaningful (e.g., a typo fix, unused-import removal, single-file mechanical rename). Complexity levels 1–2 trivial only.
4. **Orchestrate** — all other cases (default). Cross-cutting changes, novel patterns, or work whose consequences ripple beyond the immediate change site fall here.

### Marker strengths

The selected option carries the ■■□ marker in the rendered output. The other three options carry ■□□ by default. Reserve □□□ for an alternative with a clear drawback in the current context. Reserve ■■■ for the selected option only when you would actively push back against any other choice.

Each skill supplies its own recommendation context (e.g., whether the plan was developed interactively, whether a review just completed). Apply these rules using that context.

See [`ticket-creation-cost.md`](ticket-creation-cost.md) for the related decision on whether a finding warrants its own ticket. That decision (do now / batch later / separate ticket) composes with the recommendation rules above: The rules here pick the next-step _skill_; the cost reference governs whether work that surfaces alongside the current plan should spawn a new ticket or ship adjacent.
