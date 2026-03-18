# Next steps after review

Standard next-steps block for skills that produce a code review. Skills reference this file to maintain a consistent format and recommendation logic.

The next-steps block has two independent sub-blocks. Each is shown only when its condition is met. If neither condition is met, no next-steps block appears.

## Deviations sub-block

Shown when the ticket compliance section reports gaps (partial or unaddressed acceptance criteria) or unplanned work.

### Options

| Option        | Description                                          |
| ------------- | ---------------------------------------------------- |
| Update ticket | Revise the ticket to match the actual implementation |
| Leave as-is   | Accept the deviation without updating the ticket     |

### Output format

```
Deviations from ticket:
  ▶ Update ticket: Use the `design-and-plan` skill with ticket: {ticket_source}
  · Leave as-is
```

`Leave as-is` never receives the `▶` marker -- it is the passive alternative, not a recommendation.

### Recommendation rules

1. **Update ticket** -- acceptance criteria are missing or substantially different from what was implemented, OR significant unplanned work was done that should be captured
2. **Leave as-is** -- deviations are minor and intentional (e.g., a criterion was addressed differently than originally described but the intent is met)

When uncertain, recommend updating the ticket.

## Findings sub-block

Shown when the review contains actionable findings (F, W, or T categories).

### Options

| Option             | Description                                    |
| ------------------ | ---------------------------------------------- |
| Design and plan    | Rethink the approach before fixing             |
| Orchestrate        | Run the full orchestrated development pipeline |
| Implement directly | Implement fixes without orchestration          |

### Output format

```
Actionable findings:
  ▶ {recommended option} (recommended): Use the `{skill-name}` skill with ticket: {ticket_source}
  · {second option}: Use the `{skill-name}` skill with ticket: {ticket_source}
  · {third option}
```

Mark the recommended option with `▶` and others with `·`. Include all known paths (ticket) in each option line; omit paths that are not available in the current context.

Skill names for each option:

- **Design and plan** -> `design-and-plan`
- **Orchestrate** -> `orchestrate-dev`
- **Implement directly** -> no skill invocation; the user implements manually or asks the agent to begin

### Recommendation rules

Select the recommended option using these rules in priority order:

1. **Design and plan** -- findings suggest the approach needs rethinking (e.g., architectural issues, fundamental design problems, multiple FIXMEs that point to a flawed strategy)
2. **Orchestrate** -- findings are non-trivial but the approach is sound (e.g., a mix of warnings and TODOs, or FIXMEs that are localized fixes)
3. **Implement directly** -- findings are simple and well-understood (e.g., a few TODOs, minor warnings with obvious fixes)

When uncertain between two options, recommend the more thorough one.

Each skill supplies its own recommendation context (e.g., finding counts and categories, severity of deviations). Apply these rules using that context.

## Combined output format

When both sub-blocks are shown, present them as separate sections within a single next-steps block:

```
Next steps:

Deviations from ticket:
  ▶ Update ticket: Use the `design-and-plan` skill with ticket: {ticket_source}
  · Leave as-is

Actionable findings:
  ▶ Orchestrate (recommended): Use the `orchestrate-dev` skill with ticket: {ticket_source}
  · Design and plan: Use the `design-and-plan` skill with ticket: {ticket_source}
  · Implement directly
```
