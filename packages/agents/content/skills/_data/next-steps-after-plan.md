# Next steps after plan

Standard next-steps block for skills that produce or refine an implementation plan. Skills reference this file to maintain a consistent format and recommendation logic.

## Options

| #   | Emoji | Option             | Description                                      |
| --- | ----- | ------------------ | ------------------------------------------------ |
| 1   | 🧠    | Refine plan        | Review the plan for completeness and correctness |
| 2   | 🎶    | Orchestrate        | Run the full orchestrated development pipeline   |
| 3   | 🚀    | Implement directly |                                                  |

## Output format

Present all three options as a numbered list. The recommendation rules below determine which option is recommended — bold that option's label and append `(🟢 recommended)`. Include all known paths (plan, ticket) in each option line; omit paths that are not available in the current context. Use `~/`-relative paths where possible and absolute paths otherwise.

Options that invoke a skill include context-clearing guidance:

- **Refine plan** and **Orchestrate**: prepend "Clear context and use..." — the plan artifact is self-contained, and orchestration dispatches fresh subagents, so prior conversation wastes tokens and can introduce bias.
- **Implement directly**: no "Clear context" prefix — conversation history is valuable for manual implementation.

Example:

```
Next steps:
  1. 🧠 Refine plan:
     Clear context and use the `refine-plan` skill with
     plan: {plan_path},
     ticket: {ticket_source}
  2. 🎶 **Orchestrate** (recommended):
     Clear context and use the `orchestrate-dev` skill with
     plan: {plan_path},
     ticket: {ticket_source}
  3. 🚀 Implement directly
```

Skill names for each option:

- 🧠 **Refine plan** -> `refine-plan`
- 🎶 **Orchestrate** -> `orchestrate-dev`
- 🚀 **Implement directly** -> no skill invocation; the user implements manually or asks the agent to begin

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

2. **Implement directly** — recommend when the work's verification surface fits a single end-of-work review pass: single module/package, the plan is precise (or follows an established pattern closely), and the implementation's consequences are bounded enough that compiler + tests + one review pass would catch the meaningful classes of mistake. Cross-cutting changes, novel patterns, or work whose consequences ripple beyond the immediate change site fall through to rule 3.
3. **Orchestrate** — all other cases (default)

Each skill supplies its own recommendation context (e.g., whether the plan was developed interactively, whether a review just completed). Apply these rules using that context.

See [`ticket-creation-cost.md`](ticket-creation-cost.md) for the related decision on whether a finding warrants its own ticket. That decision (do now / batch later / separate ticket) composes with the recommendation rules above: the rules here pick the next-step _skill_; the cost reference governs whether work that surfaces alongside the current plan should spawn a new ticket or ship adjacent.
