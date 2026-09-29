## Next-steps options

### Options

| #   | Emoji | Option           | Description                                                     |
| --- | ----- | ---------------- | --------------------------------------------------------------- |
| 1   | 🧠    | Refine plan      | Review the plan for completeness and correctness                |
| 2   | ✂️    | Split the ticket | Cut the plan at a seam into tickets that each ship on their own |
| 3   | 🚀    | Implement        | Work the plan's tasks, then choose a review pass                |

### Output format

Present all three options as a numbered list per [option format](#option-format). Each option has a strength marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option takes the strongest marker. Pros and cons are omitted by default; add a `➕` or `➖` line only when the specific plan presents a tradeoff that survives the option-format tests bearing on which option fits (e.g., "the schema change ships and is verifiable before the reader that consumes it," "every task follows the sibling table's established pattern"). Generic option properties ("structured review pass," "longer wall time") are noise and must be omitted. Include all known paths (plan, ticket) in each option line; omit paths that are not available in the current context. Use `~/`-relative paths when possible and absolute paths otherwise. Every line subordinate to an option (invocation guidance as much as a pro or con) is a nested list item, never a whitespace-indented continuation.

**One `➕` line is mandatory rather than omitted.** When Refine plan is the selected option, it must include a `➕` line naming the specific unsettled decision that the pass would raise (rule 1). The line names an open decision, never a reassurance about work already done: "a refine pass is the cheap way to find out whether I missed something" is the shape that this requirement exists to forbid. When Split the ticket is the selected option, it must include a `➕` line naming the plan's size and the pieces (rule 2). Selecting either without its line is a defect: If the line cannot be written, the rule did not match and the cascade continues.

**Spike plans.** A spike plan has `## Investigation steps` rather than `## Tasks` (see [spike conventions](../_data/spike-conventions.md)). It is carried out to produce findings rather than implemented to produce a diff, and `implement-plan` reads only the feature shape. Render option 3 as 🔬 Investigate, without invoking a skill; the agent works the investigation steps directly. Option 1 renders unchanged. Option 2 renders at □□□ with the `➖` that a spike produces findings rather than pieces that ship. In the recommendation rules below, rule 2 never matches on a spike plan, so Investigate is the fallthrough whenever rule 1 does not match.

Options that invoke a skill include context-clearing guidance:

- **Refine plan**: Prepend "Clear context and use..." because the plan artifact is self-contained; prior conversation wastes tokens and can introduce bias.
- **Split the ticket**: No "Clear context" prefix, and no pasted invocation line; the split runs in this session, which holds the plan from which the pieces are cut. See [Splitting the ticket](#splitting-the-ticket).
- **Implement**: No "Clear context" prefix; the conversation that produced the plan contains the design decisions behind it, and `implement-plan` uses them when they are there. The user can also paste the same line into a fresh session or the other harness, in which the skill re-resolves the plan and ticket from the environment instead.

Example (rendered for the default case, in which the recommendation rules below select Implement):

```
Next steps:
1. 🧠 ■□□ Refine plan:
   - Clear context and use the `refine-plan` skill with plan: {plan_path}, ticket: {ticket_source}
2. ✂️ ■□□ Split the ticket:
   - Selection runs the split in this session
3. 🚀 ■■□ Implement:
   - Use the `implement-plan` skill with plan: {plan_path}, ticket: {ticket_source}
```

Skill names for each option:

- 🧠 **Refine plan** -> `refine-plan`
- ✂️ **Split the ticket** -> `{skill:create-ticket}`, once per piece, in this session
- 🚀 **Implement** -> `implement-plan`; on a spike plan the option is 🔬 **Investigate** and does not invoke a skill

### Recommendation rules

Select the recommended option by checking these rules in order and stopping at the first match.

1. **Refine plan**: Recommend only when you can name a load-bearing decision that the plan leaves unsettled and that a refine pass would raise.

   A decision is **unsettled** when the plan invented it and nothing has challenged it. It is **settled** when it was ratified interactively, taken from prior design work, verified against source, or copied from an established pattern already in the codebase. A `## Decisions taken` entry that survived an approval checkpoint is ratified: The developer read it and did not overrule it. The calling skill's recommendation context tells you which: A plan whose forks were challenged and ratified interactively has settled decisions, and a plan produced without a design phase is likelier to have unsettled ones.

   Rule 1 also fails when the plan's residual unknowns are **empirical**, answered by running code or writing the test. A refine pass re-reads the plan and structurally cannot answer those. Only **analytical** residue, resolvable by a closer reading, counts.

   "The plan might have a flaw I missed" does not satisfy the test. That is a reassurance about work already done, not an unsettled decision.

   The following make a plan _more likely_ to have an unsettled decision. They are evidence to weigh, and none of them matches rule 1 on its own:
   - Changes to dependency boundaries (which libraries are used, which APIs are consumed, or how they're configured)
   - Changes to the shape or semantics of behavioral contracts or data structures
   - Far-reaching downstream consequences
   - Changes to control flow, state management, or execution order
   - Introduction of new interfaces, modules, or subsystems
   - A prior `refine-plan` round significantly altered the plan or expanded the scope of the changes needed to implement it

   When rule 1 matches, the rendered option must name that decision on a `➕` line. Being unable to write the line means rule 1 did not match.

2. **Split the ticket**: Recommend only when the plan is too large for one implement-and-review pass, and it holds two or more pieces that each ship and can be verified on their own. Both halves are required: Too large without a seam is not a match, and a seam in a plan that one pass would carry is not one either.

   A piece earns a ticket when it ships and can be verified on its own, not when it looks large enough to deserve one. The `➕` line names the size and the pieces, each with the tasks that it takes: `➕ eleven tasks across three packages, and two pieces ship on their own: the schema change (tasks 1–4), then the reader that consumes it (tasks 5–11)`.

   Structural properties (new module boundaries, changed interfaces, several packages) make a plan _more likely_ to be too large. They are evidence to weigh, and none of them matches rule 2 on its own.

   When rule 2 matches, the rendered option must name the size and the pieces on a `➕` line. Being unable to write the line means rule 2 did not match.

3. **Implement**: All other cases (default), whatever the number of modules or packages that the plan touches. `implement-plan`'s closing menu re-decides the review depth from the realized diff, and Orchestrated review is among its options, so a plan sent here is not committed to a single review pass.

   When the work is trivial enough that a review pass would catch nothing meaningful ([complexity levels 1–2](../_data/complexity-classification.md): a typo fix, an unused-import removal, a single-file mechanical rename), add a `➕` line noting that the follow-up review can be skipped at `implement-plan`'s closing menu. That menu decides the review from the diff that the implementation actually produced, so a plan-time triviality read is a hint to it rather than a commitment.

#### Marker strengths

The selected option's marker follows how cleanly its rule matched: ■■■ when the rule's test is met squarely and the alternatives are worse on the criteria that decided it, ■■□ when the fit is good but an alternative stays defensible, ■□□ when little separates the options. Rule 3 is the cascade's fallthrough rather than a positive match, so its marker follows how squarely rules 1 and 2 failed: ■■■ when neither came close, ■■□ when one stayed defensible. The unselected options take ■□□ by default, and □□□ when one has a clear drawback in the current context.

Each skill supplies its own recommendation context (e.g., whether the plan was developed interactively, whether a review just completed). That context applies to rule 1's settled/unsettled test.

#### Splitting the ticket

Selecting option 2 is the developer's consent to the split at the seam that its `➕` line names. Nothing is created before that selection, and the bodies get one confirmation before anything is created:

1. Compose a ticket body per piece (problem, context, acceptance criteria) from the plan's tasks and the ticket's criteria. Compose the originating ticket's new body as well: With two pieces, rewrite it to the first piece, so that the originating ticket and one new ticket carry the split; with three or more, make it an umbrella that keeps its problem and context, lists the children, and has "Every child is closed" as its acceptance criterion. When the plan has no source ticket, every piece is a new ticket and there is nothing to rewrite.
2. Show every body and every relationship in one block and confirm once. This single confirmation stands in for the per-ticket confirmation that `{skill:create-ticket}` would otherwise raise for each piece.
3. Cut a plan per piece from the approved plan, so that each piece's session starts at Implement.
4. Create the pieces in order with `{skill:create-ticket}`, each with its own plan in context, so that the skill saves the plan beside the ticket artifact and posts it on the ticket. With three or more pieces, pass `--parent` naming the originating ticket. For a piece that depends on an earlier piece landing first, pass `--blocked-by` naming that piece's reference, which exists by then.
5. Write the originating ticket's new body per the platform-specific write in [ticket source resolution](../_data/ticket-source-resolution.md#platform-specific-write).
6. Report the ticket references and the plan paths.

See [`scope-and-deferral.md`](../_data/scope-and-deferral.md) for the related decision on whether a finding warrants its own ticket. That decision (do now / batch later / separate ticket) is about work that comes up alongside the plan; rule 2 is about the plan's own work, and its seam test comes from the ticketing preferences: A piece earns a ticket when it ships and can be verified on its own.
