---
name: save-plan
description: Save plan from conversation context as a ticket-scoped artifact
user-invocable: true
---
<!-- codeassembly-skill:save-plan -->

# Save plan

Save the plan from the current conversation as a ticket-scoped artifact. Useful after built-in plan mode, `plan`, or any conversation that produced a plan.

## Process

1. **Extract plan content** from conversation context (the most recent plan discussed or produced)

2. **Resolve artifact path**:
   - Invoke `node ~/.claude/skills/_sources/codeassembly-guidance/derive-session-context/derive-session-context.mjs` via Bash to obtain `ticket_id`, `project_slug`, and `artifact_base_dir` from the manifest JSON emitted on stdout
   - Ticket directory: `{artifact_base_dir}/projects/{project_slug}/tickets/{ticket_id}/`

3. **Resolve the slug** per [artifact conventions](~/.claude/skills/_sources/codeassembly-guidance/_data/artifact-conventions.md#naming-conventions)

4. **Resolve frontmatter fields**:

   The frontmatter conforms to the [universal artifact frontmatter](~/.claude/skills/_sources/codeassembly-guidance/_data/artifact-conventions.md#universal-artifact-frontmatter) schema plus the [plan provenance](~/.claude/skills/_sources/codeassembly-guidance/_data/artifact-conventions.md#plan-provenance) extensions.

   Run `~/.claude/scripts/resolve-frontmatter.sh --skill plan-mode --interactive true` via Bash. Prepend the output verbatim to the artifact body.

5. **Save** as ticket-level artifact:

   ```
   {YYYYMMDD-HHMMSSZ}_{slug}_plan.md
   ```

   Example: `20260226-143000Z_oauth2-migration_plan.md`

   `mkdir -p` the target directory before writing.

Follow [artifact conventions](~/.claude/skills/_sources/codeassembly-guidance/_data/artifact-conventions.md).

## Completion

Report the file path, then present a ticket prompt and next steps together in a single message. Do not wait for the user's reply before showing next steps.

```
Plan saved: {plan_path}

Would you like to create or update a ticket for this work? If so, use the `/create-ticket` skill.
```

<HARD-GATE>
Follow the options, output format, and recommendation rules in [next-steps options](#next-steps-options) exactly. Do not improvise the options. The plan was developed in conversation with user participation; use this as recommendation context. Omit the ticket path from option lines: A ticket path is not available at completion time.
</HARD-GATE>

## Next-steps options

### Options

| #   | Emoji | Option           | Description                                                     |
| --- | ----- | ---------------- | --------------------------------------------------------------- |
| 1   | 🧠    | Refine plan      | Review the plan for completeness and correctness                |
| 2   | ✂️    | Split the ticket | Cut the plan at a seam into tickets that each ship on their own |
| 3   | 🚀    | Implement        | Work the plan's tasks, then choose a review pass                |

### Output format

Present all three options as a numbered list per [option format](#option-format). Each option has a strength marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option takes the strongest marker. Pros and cons are omitted by default; add a `➕` or `➖` line only when the specific plan presents a tradeoff that survives the option-format tests bearing on which option fits (e.g., "the schema change ships and is verifiable before the reader that consumes it," "every task follows the sibling table's established pattern"). Generic option properties ("structured review pass," "longer wall time") are noise and must be omitted. Include all known paths (plan, ticket) in each option line; omit paths that are not available in the current context. Use `~/`-relative paths when possible and absolute paths otherwise. Every line subordinate to an option (invocation guidance as much as a pro or con) is a nested list item, never a whitespace-indented continuation.

**The ticket and plan are the complete handoff.** Every option assumes that a fresh session acts on the saved artifacts alone, whether or not one does, so nothing that only this session knows distinguishes one option from another. A pro or con never cites the conversation, session-held context, or what is "already in context", and neither does the invocation guidance of any option, the spike's 🔬 Investigate included. When a fact that an option needs exists only in the session, the artifact is incomplete: Add the fact to the ticket or the plan before rendering the menu, rather than citing the session.

**One `➕` line is mandatory rather than omitted.** When Refine plan is the selected option, it must include a `➕` line naming the specific unsettled decision that the pass would raise (rule 1). The line names an open decision, never a reassurance about work already done: "a refine pass is the cheap way to find out whether I missed something" is the shape that this requirement exists to forbid. When Split the ticket is the selected option, it must include a `➕` line naming the plan's size and the pieces (rule 2). Selecting either without its line is a defect: If the line cannot be written, the rule did not match and the cascade continues.

**Spike plans.** A spike plan has `## Investigation steps` rather than `## Tasks` (see [spike conventions](~/.claude/skills/_sources/codeassembly-guidance/_data/spike-conventions.md)). It is carried out to produce findings rather than implemented to produce a diff, and `implement-plan` reads only the feature shape. Render option 3 as 🔬 Investigate, without invoking a skill; the agent works the investigation steps directly and ends the run with the plan's `## Deliverable`, which includes offering the [closing post](~/.claude/skills/_sources/codeassembly-guidance/_data/spike-conventions.md#closing-post) on the ticket and making it on consent. Option 1 renders unchanged. Option 2 renders at □□□ with the `➖` that a spike produces findings rather than pieces that ship. In the recommendation rules below, rule 2 never matches on a spike plan, so Investigate is the fallthrough whenever rule 1 does not match.

Options that invoke a skill include context-clearing guidance:

- **Refine plan**: Prepend "Clear context, then..." because the plan artifact is self-contained; prior conversation wastes tokens and can introduce bias.
- **Split the ticket**: No "Clear context" prefix, and no pasted invocation line; the split runs in this session because the library doesn't have a skill for it, and it cuts the pieces from the saved plan. See [Splitting the ticket](#splitting-the-ticket).
- **Implement**: No "Clear context" prefix. The ticket and plan are self-contained, so `implement-plan` works the same in this session or in a fresh one, and clearing gains nothing: Unlike a refine or review pass, implementation is not harmed by sharing the planner's view. The user can also paste the same line into a fresh session, or into the other harness with its own skill sigil, in which the skill re-resolves the plan and ticket from the environment.

Example (rendered for the default case, in which the recommendation rules below select Implement):

```
Next steps:
1. 🧠 ■□□ Refine plan:
   - Clear context, then /refine-plan with plan: {plan_path}, ticket: {ticket_source}
2. ✂️ ■□□ Split the ticket:
   - Selection runs the split in this session
3. 🚀 ■■□ Implement:
   - /implement-plan with plan: {plan_path}, ticket: {ticket_source}
```

Skill names for each option:

- 🧠 **Refine plan** -> `refine-plan`
- ✂️ **Split the ticket** -> `/create-ticket`, once per piece, in this session
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

2. **Split the ticket**: Recommend only when the plan is too large for one implement-and-review pass, and it contains two or more pieces that can each be merged and verified on their own. Both halves are required: Too large without a seam is not a match, and a seam in a plan that one pass would cover is not one either.

   A piece gets its own ticket when it can be merged and verified on its own, not when it looks large enough to deserve one. The `➕` line names the size and the pieces, each with the tasks that it takes: `➕ eleven tasks across three packages, and two pieces ship on their own: the schema change (tasks 1–4), then the reader that consumes it (tasks 5–11)`.

   Structural properties (new module boundaries, changed interfaces, several packages) make a plan _more likely_ to be too large. They are evidence to weigh, and none of them matches rule 2 on its own.

   When rule 2 matches, the rendered option must name the size and the pieces on a `➕` line. Being unable to write the line means rule 2 did not match.

3. **Implement**: All other cases (default), whatever the number of modules or packages that the plan touches. `implement-plan`'s closing menu re-decides the review depth from the realized diff, and it offers a split when the diff proves too large for one review pass, so a plan sent here is not committed to a single pull request.

   When the work is trivial enough that a review pass would catch nothing meaningful ([complexity levels 1–2](~/.claude/skills/_sources/codeassembly-guidance/_data/complexity-classification.md): a typo fix, an unused-import removal, a single-file mechanical rename), add a `➕` line noting that the follow-up review can be skipped at `implement-plan`'s closing menu. Because that menu decides the review from the diff that the implementation actually produced, a plan-time triviality read is a hint to it rather than a commitment.

#### Marker strengths

The selected option's marker follows how cleanly its rule matched: ■■■ when the rule's test is met squarely and the alternatives are worse on the criteria that decided it, ■■□ when the fit is good but an alternative stays defensible, ■□□ when little separates the options. Because rule 3 is the cascade's fallthrough rather than a positive match, its marker follows how squarely rules 1 and 2 failed: ■■■ when neither came close, ■■□ when one stayed defensible. The unselected options take ■□□ by default, and □□□ when one has a clear drawback in the current context.

Each skill supplies its own recommendation context (e.g., whether the plan was developed interactively, whether a review just completed). That context applies to rule 1's settled/unsettled test.

#### Splitting the ticket

Selecting Split is the developer's consent to the split at the seam that its `➕` line names. Nothing is created before that selection, and the bodies get one confirmation before anything is created.

**Compose.** Compose a ticket body per piece (problem, context, acceptance criteria) from the piece's work and the ticket's criteria. Compose the originating ticket's new body as well: With two pieces, rewrite it to the first piece, so that the originating ticket and one new ticket cover the two pieces; with three or more, make it an umbrella that keeps its problem and context, lists the children, and has "Every child is closed" as its acceptance criterion. When the work does not have a governing ticket, every piece is a new ticket and there is nothing to rewrite.

**Confirm once.** Show every body, every relationship, and everything that the steps below create or change in one block, and confirm once. This single confirmation stands in for the per-ticket confirmation that `/create-ticket` would otherwise raise for each piece.

**Cut the plans.** Cut a plan per piece from the approved plan, so that each piece's session can start at Implement. Keep each piece's plan in context when its ticket is created, so that `/create-ticket` saves the plan beside the ticket artifact and posts it on the ticket.

**Create the tickets.** Create the pieces in order with `/create-ticket`. With three or more pieces, pass `--parent` naming the originating ticket. For a piece that depends on an earlier piece being merged first, pass `--blocked-by` naming that piece's reference, which exists by then.

**Rewrite the originating ticket.** Write the originating ticket's new body per the platform-specific write in [ticket source resolution](~/.claude/skills/_sources/codeassembly-guidance/_data/ticket-source-resolution.md#platform-specific-write).

**Save the first piece's plan.** With two pieces, save the first piece's plan in the originating ticket's directory per `/save-artifact`. Its timestamp is later than the approved plan's, so `implement-plan` resolves it rather than the unsplit plan.

**Report.** Report the ticket references and the plan paths. Choose each ticket's entry point from what its artifacts settle: `/design-and-plan` when the piece's design needs a closer look; `/plan` when the ticket is ready but does not have a plan; `/refine-plan` when its plan leaves a decision unsettled, by the test in rule 1 above; `/implement-plan` otherwise, which is the default for a plan cut from an approved one.

**Launch prompts.** Present one launch prompt for each ticket that keeps work, ready to paste into a fresh session: With two pieces, the originating ticket gets one; an umbrella does not get one. Order the prompts by work order: A ticket comes after every ticket that blocks it, and otherwise in the order in which it was created. Render each prompt as a bold heading line, `**{ticket_ref}: {title}** (ready now)` or `(after {blocker_ref} merges)`, followed by a fenced block that contains only the text to paste:

- The entry invocation, which the rule above chooses, as `{entry_skill} with plan: {plan_path}, ticket: {ticket_ref}`, adding any flag that the rule names, and omitting the plan when the ticket does not have one.
- The scope notes that the session needs and that the artifacts do not state, such as "only tasks 2 and 3" or "merge only after `live` contains #N".
- The ticket's blockers, by reference.

See [`scope-and-deferral.md`](~/.claude/skills/_sources/codeassembly-guidance/_data/scope-and-deferral.md) for the related decision on whether a finding warrants its own ticket. That decision (do now / batch later / separate ticket) is about work that comes up alongside the plan; rule 2 is about the plan's own work, and its seam test comes from the ticketing preferences: A piece gets its own ticket when it can be merged and verified on its own.

## Option format

**Confirm that the menu is needed before rendering it.** Mark the options first, check the leader as "Check the leader before rendering" below states, then read the markers: Render the menu only when the two strongest options are both ■■□, when the list is unmarked, or when the decision is in the gated class below. Decide every other field: State the decision in one line with its reason, record it, and proceed. Decide an all-■□□ field too. An unmarked list is a pure-preference call, and a preference is in the gated class. The rejected alternative belongs in a clause ("X rather than Y, because Z"), never as a numbered option awaiting selection.

A determination that has one right answer under a governing document, such as a change's work type under the work-type test, is not a fork. Resolve doubt about which answer the test yields by applying the test and picking: Two options marked ■■□ are a fork between acceptable options, not doubt about a fact. The developer holds less of the evidence than the agent, so handing the doubt back produces a worse-informed answer.

The gated class is closed. Ask about these decisions whatever the markers say:

- the shape of a public API or a contract
- remote shared state: a ticket edit, a push, a merge, the creation of a branch or a ticket
- data loss, or any action that cannot be undone
- spend or budget
- a preference for which you do not hold any evidence

Decide everything else yourself by default. Never decide a gated action in your own voice: The developer authorizes it; recommend, build on the recommendation provisionally, and ask at the checkpoint. Building on it means doing the work that depends on the answer; hold the gated action itself until the developer authorizes it. A templated next-steps menu is in the class, because what to do next is a preference about the developer's time, for which you do not hold any evidence. Verification is never in the gated class: Run a check that a command, a test, or a browser could settle.

**Proceed provisionally.** Do everything that does not depend on an answer first, and raise an ask only when the work is blocked or at the skill's checkpoint. When a gated decision has a strong recommendation, build on it, mark it 🔲 as "Record what you did not ask" states, and ask at the checkpoint; revise if overruled. In a skill without a phase structure, treat the skill's own approval gate, or the end of its work, as the checkpoint.

**Batch, never stream.** Collect the asks that survive the gate into one review at the checkpoint, not one per turn.

**Record what you did not ask.** Write every decision that the gate let you take into the plan's `## Decisions taken` section, with a one-line reason; when the work does not have a plan, write it into the turn's summary. Always record: A silent decision is worse than an ask. Start each line that states a decision awaiting the checkpoint with 🔲, wherever you state it: in the record, and in a turn's narrative, such as a checkpoint summary or a list of decisions. The marker lets the developer find what they may overrule without reading every line. Drop it once the developer approves the checkpoint at which the decision was presented.

**Never rank the options by your own elapsed time, round trips, or effort.** You measure these costs yourself, and that measure counts the user's context switch and review cycles as nothing. Measuring one does not make the call yours, and a more accurate measurement still cannot rank the options.

Ordering follows from the gate. When the order changes the code or the total effort -- upstream before downstream, a refactor before the feature that would otherwise be written twice -- recommend it and mark it, naming the delay that it causes and saying nothing about delay when none is involved. When the outcomes are identical and only the timing differs, such as when queued work is picked up, present the cost, render the options unmarked, and put the choice at the checkpoint.

Asking is not neutral. It costs the developer a context switch, and it idles the session until the answer arrives. A wrong-but-stated recommendation costs them a word to correct; a decision handed back costs them an evaluation and costs the session the wait.

Render every option-style question in this form: any numbered list of 2 or more choices with substantive tradeoffs, including templated next-steps menus and yes/no choices in which both paths are concrete actions. Reserve `👍🏼👎🏼` for confirmation prompts, in which a single action has been proposed and "no" means "let's adjust or discuss" rather than a concrete alternative.

**Number every option**: `1.`, `2.`, `3.` The number is how the user selects. Never render the options as bullets or bare prose.

**Mark every option with a strength marker.** The recommended option is the one with the strongest marker. Do not write a separate "I recommend option N" sentence, and a recommendation that does not match the strongest marker is a defect.

| Marker | Label                | When to use                                                                                                                                   |
| ------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| ■■■    | strongly recommended | One option is clearly better on the criteria governing the decision, and your ranking does not turn on a preference that only the user holds. |
| ■■□    | recommended          | Your lean. Default level when you have a preference.                                                                                          |
| ■□□    | weakly recommended   | A slight edge; mostly preference.                                                                                                             |
| □□□    | not recommended      | Clear drawbacks; included for completeness or to rule out explicitly.                                                                         |

Marking is all-or-none: Once any option has a marker, give every option one. Without a preference (a pure taste call), omit markers from every option and don't explain the omission; the absence is the signal. Mark at the strength that you actually hold: A marker that reads the same whatever the analysis found does not convey any information, and the reader must do all the work of telling a real choice from a formality. Render markers as plain text, never inside backticks; backticks shrink the glyphs and hurt readability.

**Format each option** as marker, then title, then a colon. Make each pro (`➕`) and con (`➖`) a nested list item beneath its option, without terminal punctuation. Apply this even when an option has only one pro or con. Lead with the strongest argument.

Make every line subordinate to an option (a pro, a con, invocation guidance) a nested list item, never a whitespace-indented continuation. Indentation by spaces, ASCII or non-breaking alike, does not survive terminal rendering: The lines collapse to the left margin, and the reader cannot tell which reason belongs to which option. Markdown structure survives; whitespace does not.

Stop nesting at one level: Never put a sub-option in an option or a sub-pro in a pro. Terminal rendering stops being reliable at deeper nesting, so this contract is written never to need it.

**Write only bullets that are real.** Bullets report the weight of each option, not a balance between the options: When the options differ in quality, an uneven menu is the accurate one, and a menu that looks balanced misreports the analysis. A `➕` or `➖` asserts that the reader should weigh it, and bullets render at equal visual weight. A manufactured one reads exactly like a load-bearing one, and it takes a round trip to discover that it was empty. Seven tests:

- **Falsifiability.** A `➖` must be false for at least one other option on the menu, and a `➕` likewise. Anything that would still be true if this were the only option is a mechanic of carrying it out rather than a tradeoff; it belongs on the invocation line or nowhere.
- **Decision weight.** Would a reader who believed this bullet choose differently? Bookkeeping, mechanically-implied, and trivially-reversible consequences (a doc line to update, a criterion to reword, a rename to propagate) are real, specific, and decision-irrelevant. Restatements of an option's inherent properties ("longer wall time", "structured review pass", "ships faster") are one instance of the same failure.
- **Session context.** Cut a bullet that cites the conversation, what the session holds, or what is "already in context". Every handoff goes through a saved artifact, so session context does not distinguish one option from another, and a bullet that rests on it tells the reader that the artifact is incomplete. When the bullet is true, the artifact has a gap: Add the fact to the artifact rather than citing the session.
- **Consequence.** State in a `➖` what breaks or what it costs, and for whom, concretely enough that the reader can weigh it without investigating. Cut a con that cannot be stated that way.
- **The qualifier tell.** A bullet undercut by its own qualifier ("negligible", "inert", "harmless") is filler. The only repair is to cut the bullet: Deleting the qualifier leaves the same minor con, now looking weighty.
- **One tradeoff, stated once.** When one option's `➕` restates another option's `➖`, the two options are the sides of one tradeoff. State it once, in a line above the list, rather than as bullets split between the options, which the reader counts as separate reasons.
- **Check before you hedge.** If a cheap check would settle whether a con is real, run the check. Presenting the uncertainty as a bullet transfers the check to the user.

Asymmetry is a report, not a defect. Give an option that has three real pros but lacks a real con its three pros, and do not give it a con. Never add a bullet to fill a slot, reach parity between options, or avoid looking one-sided; when the honest cost is hard to find, that difficulty is itself evidence the option is strong. When every option lacks a real bullet, omit them all and let the markers alone convey the recommendation. Do not add tiebreaker text for equal-strength options; the developer picks the number.

Keep on a `□□□` option the `➖` that explains why you ruled it out. Under the falsifiability test that bullet is real by construction, and without it the reader is left with a veto that they cannot check.

**Check the leader before rendering.** Once you have drafted the bullets, and before you read the markers against the gate, run this check. It applies to a gated decision as fully as to any other: The menu renders whatever the markers say, and the marker tells the developer how much deliberation the ask needs.

1. For each alternative, look for a cost that disqualifies it, including one that follows from the constraints and acceptance criteria of the work at hand. When you find one, state it as the alternative's `➖`.
2. For each `➖` on the strongest-marked option, name the reader who would choose differently because of it. Cut the bullet if there is none.
3. Re-mark the options. When every alternative has a disqualifying `➖`, mark the leader ■■■. The observed bias is a marker set too weak, not one set too strong.
4. Re-apply the gate. Outside the gated class, a leader marked above every other option means that the field is decided: State the decision in one line, and do not render a menu. Inside the class, render the menu with the leader's marker as the check set it.

**Identify each question** when a single response contains 2 or more option-style questions: Prefix them `Q1`, `Q2`, and so on, so that the user can reference answers unambiguously. When the underlying data already has stable identifiers (plan-review findings such as `C1` or `X2`), use those in place of `Q1`/`Q2`. For a single option-style question, omit the identifier. Inside an [action-items block](~/.claude/skills/_sources/codeassembly-guidance/_data/action-items.md), identifiers are mandatory whenever the block contains more than one item (or more than one independently-numbered list), and they distinguish actions (`A`) from questions (`Q`).

Example:

```
How should the exported `loadConfig` report a missing file?
1. ■■■ Return `undefined`:
   - ➕ matches the package's three other loaders, so callers keep one pattern
2. ■□□ Throw `ConfigNotFoundError`:
   - ➖ each of the 14 call sites needs a new `try`/`catch` to keep its current behavior
3. □□□ Return an empty config:
   - ➖ a caller cannot tell a missing file from an empty one, so a mistyped path silently disables every setting
```

The decision is the shape of a public API, so the gate renders the menu although one option leads. The leader does not have a `➖` because none survived the check.
