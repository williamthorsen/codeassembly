## Next-steps options

### Options

| #   | Emoji | Option      | Description                                      |
| --- | ----- | ----------- | ------------------------------------------------ |
| 1   | 🧠    | Refine plan | Review the plan for completeness and correctness |
| 2   | 🎶    | Orchestrate | Run the full orchestrated development pipeline   |
| 3   | 🚀    | Implement   | Work the plan's tasks, then choose a review pass |

### Output format

Present all three options as a numbered list per [option format](#option-format). Each option carries a strength marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option earns the strongest marker. Pros and cons are omitted by default — add a `➕` or `➖` line only when the specific plan presents a context-specific tradeoff bearing on which option fits (e.g., "plan introduces a new dependency boundary," "single module with no downstream effects"). Generic option properties ("structured review pass," "longer wall time") are noise and must be omitted. Include all known paths (plan, ticket) in each option line; omit paths that are not available in the current context. Use `~/`-relative paths where possible and absolute paths otherwise. Every line subordinate to an option — invocation guidance as much as a pro or con — is a nested list item, never a whitespace-indented continuation.

**One `➕` line is mandatory rather than omitted.** When Refine plan is the selected option, it must carry a `➕` line naming the specific unsettled decision the pass would surface (rule 1). The line names an open decision, never a reassurance about work already done: "a refine pass is the cheap way to find out whether I missed something" is the shape this requirement exists to forbid. Selecting Refine plan without such a line is a defect — if the line cannot be written, rule 1 did not match and the cascade continues to rule 2.

**Spike plans.** A spike plan carries `## Investigation steps` rather than `## Tasks` (see [spike conventions](../_data/spike-conventions.md)). It is carried out to produce findings rather than implemented to produce a diff, and `implement-plan` reads only the feature shape. Render option 3 as 🔬 Investigate, invoking no skill — the agent works the investigation steps directly. Options 1 and 2 render unchanged. In the recommendation rules below, rule 2 is the Investigate option: its feature-shaped test — verification surface, review pass, `implement-plan`'s closing menu — is written for a diff and does not apply, so rule 2 matches whenever rule 1 does not, and rule 3 never fires, since there is no implementation for the development pipeline to run.

Options that invoke a skill include context-clearing guidance:

- **Refine plan** and **Orchestrate**: Prepend "Clear context and use..." because the plan artifact is self-contained and orchestration dispatches fresh subagents; prior conversation wastes tokens and can introduce bias.
- **Implement**: No "Clear context" prefix; the conversation that produced the plan carries the design decisions behind it, and `implement-plan` uses them when they are there. The same line also pastes into a fresh session or the other harness, where the skill re-resolves the plan and ticket from the environment instead.

Example (rendered for the default case, where the recommendation rules below select Orchestrate):

```
Next steps:
1. 🧠 ■□□ Refine plan:
   - Clear context and use the `refine-plan` skill with plan: {plan_path}, ticket: {ticket_source}
2. 🎶 ■■□ Orchestrate:
   - Clear context and use the `orchestrate-dev` skill with plan: {plan_path}, ticket: {ticket_source}
3. 🚀 ■□□ Implement:
   - Use the `implement-plan` skill with plan: {plan_path}, ticket: {ticket_source}
```

Skill names for each option:

- 🧠 **Refine plan** -> `refine-plan`
- 🎶 **Orchestrate** -> `orchestrate-dev`
- 🚀 **Implement** -> `implement-plan`; on a spike plan the option is 🔬 **Investigate** and invokes no skill

### Recommendation rules

Select the recommended option by checking these rules in order and stopping at the first match.

1. **Refine plan** — recommend only when you can name a load-bearing decision the plan leaves unsettled that a refine pass would surface.

   A decision is **unsettled** when the plan invented it and nothing has challenged it. It is **settled** when it was ratified interactively, carried in from prior design work, verified against source, or copied from an established pattern already in the codebase. The calling skill's recommendation context tells you which: a plan whose forks were challenged and ratified interactively carries settled decisions, and a plan produced with no design phase is likelier to carry unsettled ones.

   Rule 1 also fails when the plan's residual unknowns are **empirical** — answered by running code or writing the test. A refine pass re-reads the plan and structurally cannot answer those. Only **analytical** residue, resolvable by a closer reading, counts.

   "The plan might have a flaw I missed" does not satisfy the test. That is a reassurance about work already done, not an unsettled decision.

   The following make a plan _more likely_ to carry an unsettled decision. They are evidence to weigh, and none of them matches rule 1 on its own:
   - Changes to dependency boundaries (which libraries are used, which APIs are consumed, or how they're configured)
   - Changes to the shape or semantics of behavioral contracts or data structures
   - Far-reaching downstream consequences
   - Changes to control flow, state management, or execution order
   - Introduction of new interfaces, modules, or subsystems
   - A prior `refine-plan` round significantly altered the plan or expanded the scope of the changes needed to implement it

   When rule 1 matches, the rendered option must name that decision on a `➕` line. Being unable to write the line means rule 1 did not match.

2. **Implement** — recommend when the work's verification surface fits a single end-of-work review pass: single module/package, the plan is precise (or follows an established pattern closely), and the implementation's consequences are bounded enough that compiler + tests + one review pass would catch the meaningful classes of mistake. The default for bounded work, trivial and non-trivial alike.

   When the work is trivial enough that a review pass would catch nothing meaningful ([complexity levels 1–2](../_data/complexity-classification.md) — a typo fix, an unused-import removal, a single-file mechanical rename), this option still applies; add a `➕` line noting that the follow-up review can be skipped at `implement-plan`'s closing menu. That menu decides the review from the diff the implementation actually produced, so a plan-time triviality read is a hint to it rather than a commitment.

3. **Orchestrate** — all other cases (default). Cross-cutting changes, novel patterns, or work whose consequences ripple beyond the immediate change site fall here.

#### Marker strengths

The selected option carries the ■■□ marker in the rendered output. The other two options carry ■□□ by default. Reserve □□□ for an alternative with a clear drawback in the current context. Reserve ■■■ for the selected option only when you would actively push back against any other choice.

Each skill supplies its own recommendation context (e.g., whether the plan was developed interactively, whether a review just completed). Rule 1's settled/unsettled test is where it acts.

See [`scope-and-deferral.md`](../_data/scope-and-deferral.md) for the related decision on whether a finding warrants its own ticket. That decision (do now / batch later / separate ticket) composes with the recommendation rules above: The rules here pick the next-step _skill_; that reference governs whether work that surfaces alongside the current plan should spawn a new ticket or ship adjacent.
