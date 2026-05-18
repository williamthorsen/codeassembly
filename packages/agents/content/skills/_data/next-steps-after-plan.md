# Next steps after plan

Standard next-steps block for skills that produce or refine an implementation plan. Skills reference this file to maintain a consistent format and recommendation logic.

## Options

| #   | Emoji | Option                                   | Description                                                             |
| --- | ----- | ---------------------------------------- | ----------------------------------------------------------------------- |
| 1   | 🧠    | Refine plan                              | Review the plan for completeness and correctness                        |
| 2   | 🎶    | Orchestrate                              | Run the full orchestrated development pipeline                          |
| 3   | 🚀🔍  | Implement directly with follow-up review | Implement, then run a single end-of-work review pass as a separate step |
| 4   | 🚀    | Implement directly                       | Implement without a follow-up review (reserved for trivial work)        |

## Output format

Present all four options as a numbered list in [recommendation-gradient](./recommendation-gradient.md) form. Each option carries a strength marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option earns the strongest marker. Pros and cons are omitted by default — add a `➕` or `➖` line only when the specific plan presents a context-specific tradeoff bearing on which option fits (e.g., "plan introduces a new dependency boundary," "single module with no downstream effects"). Generic option properties ("structured review pass," "longer wall time") are noise and must be omitted; see the [recommendation gradient's don'ts](./recommendation-gradient.md#donts) for the rule. Include all known paths (plan, ticket) in each option line; omit paths that are not available in the current context. Use `~/`-relative paths where possible and absolute paths otherwise.

Options that invoke a skill include context-clearing guidance:

- **Refine plan** and **Orchestrate**: Prepend "Clear context and use..." because the plan artifact is self-contained and orchestration dispatches fresh subagents; prior conversation wastes tokens and can introduce bias.
- **Implement directly with follow-up review** and **Implement directly**: No "Clear context" prefix; conversation history is valuable for manual implementation. The follow-up-review variant adds a separate `review-branch` step after implementation.

Example (rendered for the default case, where the recommendation rules below select Orchestrate):

```
Next steps:
1. 🧠 ■□□ Refine plan:
   Clear context and use the `refine-plan` skill with
   plan: {plan_path},
   ticket: {ticket_source}
2. 🎶 ■■□ Orchestrate:
   Clear context and use the `orchestrate-dev` skill with
   plan: {plan_path},
   ticket: {ticket_source}
3. 🚀🔍 ■□□ Implement directly with follow-up review:
   Implement directly, then clear context and use the `review-branch` skill with
   ticket: {ticket_source}
4. 🚀 ■□□ Implement directly
```

Skill names for each option:

- 🧠 **Refine plan** -> `refine-plan`
- 🎶 **Orchestrate** -> `orchestrate-dev`
- 🚀🔍 **Implement directly with follow-up review** -> no plan-time skill invocation; implement manually, then run `review-branch` (or `orchestrate-review`) as a separate post-implementation step
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

2. **Implement directly with follow-up review** — recommend when the work's verification surface fits a single end-of-work review pass: single module/package, the plan is precise (or follows an established pattern closely), and the implementation's consequences are bounded enough that compiler + tests + one review pass would catch the meaningful classes of mistake. The default for non-trivial bounded work; trivial work at complexity levels 1–2 falls to rule 3.
3. **Implement directly** — recommend instead of rule 2 when the work is trivial enough that a review pass would catch nothing meaningful (e.g., a typo fix, unused-import removal, single-file mechanical rename). Complexity levels 1–2 trivial only.
4. **Orchestrate** — all other cases (default). Cross-cutting changes, novel patterns, or work whose consequences ripple beyond the immediate change site fall here.

### Marker strengths

The selected option carries the ■■□ marker in the rendered output. The other three options carry ■□□ by default. Reserve □□□ for an alternative with a clear drawback in the current context. Reserve ■■■ for the selected option only when you would actively push back against any other choice. See [recommendation-gradient markers](./recommendation-gradient.md#markers) for the full marker table and worked examples of the ■■■ and □□□ cases.

Each skill supplies its own recommendation context (e.g., whether the plan was developed interactively, whether a review just completed). Apply these rules using that context.

See [`ticket-creation-cost.md`](ticket-creation-cost.md) for the related decision on whether a finding warrants its own ticket. That decision (do now / batch later / separate ticket) composes with the recommendation rules above: The rules here pick the next-step _skill_; the cost reference governs whether work that surfaces alongside the current plan should spawn a new ticket or ship adjacent.
