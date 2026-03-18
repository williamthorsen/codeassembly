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

Select the recommended option using these rules in priority order:

1. **Refine plan** -- the plan is unreviewed and the work is non-trivial, OR a review surfaced significant scope changes or unresolved questions
2. **Orchestrate** -- the plan involves non-trivial code changes
3. **Implement directly** -- the work is trivially simple, prose-only, or a single well-understood change

When uncertain between two options, recommend the more thorough one.

Each skill supplies its own recommendation context (e.g., whether the plan is unreviewed, whether a review just completed). Apply these rules using that context.
