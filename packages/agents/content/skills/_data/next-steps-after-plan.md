# Next steps after plan

Standard next-steps block for skills that produce or refine an implementation plan. Skills reference this file to maintain a consistent format and recommendation logic.

## Options

| Option             | Description                                       |
| ------------------ | ------------------------------------------------- |
| Refine plan        | Review the plan for completeness and correctness  |
| Orchestrate        | Run the full orchestrated development pipeline    |
| Implement directly | Implement without orchestration (no review cycle) |

## Output format

Present all three options. Mark the recommended option with `▶` and others with `·`. Include all known paths (plan, ticket) in each option line; omit paths that are not available in the current context.

```
Next steps:
  ▶ {recommended option} (recommended): Use the `{skill-name}` skill with plan: {plan_path}, ticket: {ticket_source}
  · {second option}: Use the `{skill-name}` skill with plan: {plan_path}, ticket: {ticket_source}
  · {third option}
```

Skill names for each option:

- **Refine plan** -> `refine-plan`
- **Orchestrate** -> `orchestrate-dev`
- **Implement directly** -> no skill invocation; the user implements manually or asks the agent to begin

## Recommendation rules

Select the recommended option by checking these rules in order and stopping at the first match.

1. **Refine plan** — recommend when both of the following are true:

   The plan involves any of:
   - Non-trivial changes in how dependencies are used
   - Non-trivial changes in behavioral contracts or data structures
   - Non-trivial or far-reaching downstream consequences
   - Changes to control flow, state management, or execution order
   - Introduction of new interfaces, modules, or subsystems

   AND either of:
   - The plan has not been previously refined
   - A prior iteration of `refine-plan` resulted in significant alteration of the plan or significant expansion of the scope of the changes required to implement the plan

2. **Implement directly** — recommend when the work is mechanical, touches an isolated module, or follows an established pattern closely enough that the coder's first pass is sufficient
3. **Orchestrate** — all other cases (default)

Each skill supplies its own recommendation context (e.g., whether the plan was developed interactively, whether a review just completed). Apply these rules using that context.
