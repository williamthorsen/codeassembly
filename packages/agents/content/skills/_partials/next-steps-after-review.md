## Next-steps options

The next-steps block has three independent sub-blocks. Each is shown only when its condition is met. If no condition is met, no next-steps block appears. Whatever combination of sub-blocks is shown, always wrap the output in a `Next steps:` header. When two or more sub-blocks appear, label each with its `A` identifier as a bold prefix (`**A1: Deviations from ticket**`, and so on) and keep each sub-block's own 1-based numbering, so the user answers `A1: 1, A2: 2`; a lone sub-block has no identifier.

Use `~/`-relative paths where possible and absolute paths otherwise. Every line subordinate to an option (invocation guidance as much as a pro or con) is a nested list item, never a whitespace-indented continuation; see [option format](#option-format).

**Naming a skill in the render.** Name a skill in the rendered option only when the user must carry the invocation across a session boundary: clearing context, handing off to another session, or waiting for someone else to act. When the agent runs the skill in the current session, the skill name appears in the sub-block's Options table and the rendered line is a bare action. This keeps each rendered line to the step the user performs.

**Reviewer and author roles.** A review surfaces findings; the author disposes of them. The options below route the reviewer's output to the author or record what the review found; they never ask the reviewer to re-design, re-plan, or orchestrate a workflow, none of which is the reviewer's job.

### Proposed-edit preview

Three of the sub-blocks below offer options that rewrite an artifact, one each: the Deviations sub-block rewrites the ticket's acceptance criteria, the source-divergence sub-block rewrites the PR description, and the Findings sub-block rewrites the source. The user consents to that rewrite by picking a number, so every such option renders a preview of the edit it would make. Which criteria are genuinely in conflict with the implementation, and which findings name a change the reviewer can carry out, are judgments the reviewer makes; the preview is where those judgments become reviewable instead of silent.

**Placement.** The preview renders above the numbered options, inside its sub-block, under a `Proposed edit to the {target}:` label naming what it would change; the source target's label is plural, `Proposed edits to the source:`, because it covers every open finding. Option lines stay bare actions: The preview is never a pro, a con, or a line nested beneath an option. An option that mutates nothing, such as "Leave as-is", has no preview.

Ticket and PR-description deltas render as a flat list, one line per change. Source entries render as blocks instead, each led by its bolded finding ID, because a table cannot live inside a list item and still render and the [option format](#option-format)'s nesting stops one level short of carrying one.

**Notation.** The preview is a delta. It never restates the ticket, the PR description, or a finding's Recommendation, which would duplicate the artifact in the terminal, and it carries one entry per change:

- **Ticket targets** derive their delta from the in-conflict criteria rows of `## Specification compliance`'s ticket subsection, and from nothing else. Unplanned work is never a source: Implementation that goes beyond the criteria is not a deviation, so it yields no line. A ticket's `## Problem`, `## Context`, and `## Proposed solution` record what was known and proposed when it was written, so no edit this menu offers reaches them; a divergence between one of them and the implementation is reported in the PR description instead.
  - `Reword: {old} → {new}` for a criterion whose direction the implementation deliberately contradicts
  - `Drop: {criterion}` for a criterion the implementation deliberately abandoned, never for one it has not yet reached
- **PR-description targets** render the concrete claim changes, each keyed to the divergent `D{n}` row it came from: `D2: {claim as written} → {claim as built}`.
- **Source targets** derive their delta from the open findings, one entry per finding, keyed to its ID. An entry states two things: the surface the change touches (source, test, comment, docs, config) and the substance of the edit. Its form follows the edit's own granularity rather than a fixed notation, so a literal single-site edit is a `{old} → {new}` clause, many sites sharing one edit are a table captioned with what is invariant across its rows, and a structural edit is a prose clause naming the shape of the resulting diff. A code snippet is one rendering among these, never the required form.

Every finding has one of the two shapes the [Proposed-change gate](../review-criteria/SKILL.md#proposed-change-gate) fixes, and a source entry renders which one it has: a single named change, or a choice among named alternatives the author decides. The second is tagged as the author's choice, and its alternatives are named rather than resolved; picking an option that would implement it is picking someone to make that call. A finding with no envisioned change is not a legal finding and has no entry.

Render no exclusions line. A criterion genuinely arguable as in conflict belongs in the delta, where the user can strike it. Listing what was left out over-triggers into noise and hides the proposal it was meant to qualify.

**Open findings.** When a ticket or PR-description delta line would settle or obviate an open finding, follow it with a sibling `⚠️` list item naming that finding, so the user can see that accepting the edit pre-empts the finding's disposition. Those preview lists stay flat; nothing nests beneath a delta line.

**The preview is the contract.** The edit executed is the edit previewed. When carrying it out surfaces a change the preview did not contain, stop and re-confirm with the new line shown; never widen the edit under consent already given.

**Empty delta.** When no line survives the judgment, the Deviations sub-block has nothing to propose and does not render at all; see its [trigger](#deviations-sub-block). Where a source divergence proposes a PR-description edit, that delta is never empty, because a divergence the implementation resolves in the ticket's favor always leaves a claim to reconcile. A source delta is never empty either: The Findings sub-block renders only when there is at least one finding, and every finding names a change.

### Deviations sub-block

Shown when at least one criterion in the ticket subsection of `## Specification compliance` is in conflict with the implementation, equivalently when the criteria delta contains at least one line. Compute the delta first: An empty delta renders no sub-block.

A criterion from another spec source never fires this sub-block, whose only edit rewrites the ticket. Every ticket edit a review offers is this sub-block's, and a PR description at odds with the implementation is the [source divergence sub-block](#source-divergence-sub-block)'s.

A criterion that is merely unbuilt contributes no line. The work is unfinished, not redirected, and a contract is not revised to match a moving target. Implementation that exceeds the criteria contributes none either.

#### Options

| #   | Emoji | Option                         | Description                                                                                                                                                       |
| --- | ----- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 📝    | Update the acceptance criteria | Run `align-ticket-with-implementation`, which revises acceptance criteria alone, bound to the previewed delta, and writes the ticket of record where one resolves |
| 2   | ⏭️    | Leave as-is                    | Accept the deviation without updating the ticket                                                                                                                  |

#### Output format

Render the list per [option format](#option-format). Each option has a marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option takes the strongest marker. Option 1 renders the criteria delta above the list per [proposed-edit preview](#proposed-edit-preview). Pros and cons are omitted by default; add a `➕` or `➖` line only when the specific deviation presents a tradeoff that survives the option-format tests (e.g., "the abandoned criterion was load-bearing for downstream tests"). Generic restatements ("ships faster," "ticket drifts from reality") are noise and must be omitted. That default applies to pros and cons alone: It never suppresses the proposed-edit preview, which is required content.

**Name the artifact the edit writes.** Option 1's rendered line ends with its target: `on {ticket_ref}` where a ticket of record resolves, whichever artifact supplied the spec source, and `in the local ticket snapshot` where none does. A ticket of record is the manifest's `ticket_url`, or `ticket_id` with `scm`; where auto-resolve passed over a remote candidate on recency, it already holds one.

**Offer the local-only form where the snapshot may be the contract.** Where the review measured against the local snapshot while a remote candidate existed, nest one invocation line under option 1; omit it otherwise:

```
1. 📝 ■■□ Update the acceptance criteria on {ticket_ref}
   - or `1 local`: update the local snapshot alone, leaving {ticket_ref} as it stands
2. ⏭️ ■□□ Leave as-is
```

A selection qualified `local` runs the delegate with `--write-target=local`.

Example (rendered for the recommendation case):

```
Next steps:

Deviations from ticket:

Proposed edit to the acceptance criteria:
- Reword: "Warns on an unknown directive" → "Fails on an unknown directive"
- ⚠️ W2 asks whether an unknown directive should fail the run at all; accepting this reword settles it as the contract
- Drop: A `--strict` flag gates the new validation

1. 📝 ■■□ Update the acceptance criteria on {ticket_ref}
2. ⏭️ ■□□ Leave as-is
```

When the recommendation rules indicate no preference, omit markers from both options per the gradient's pure-taste-call form.

#### Recommendation rules

1. **Recommend "Update the acceptance criteria"**: The implementation's direction is deliberate and sound, so the criteria as written would lead a later reader to judge correct code wrong.
2. **Recommend "Leave as-is"**: The review raised a finding on the conflicting behavior. The code is what is in question, and revising the contract to match it would hide the finding.
3. **No recommendation** (omit markers from both options): The reviewer cannot tell whether the criteria or the implementation is the wrong one. The user decides.

#### Marker strengths

For rules 1 and 2, the recommended option's marker follows how cleanly the rule's test is met: ■■■ where the evidence is unambiguous (the direction is plainly deliberate and sound for rule 1, or the finding plainly stands for rule 2), and ■■□ where the reading is defensible but arguable. The other option takes ■□□. Rule 3 has no markers.

### Source divergence sub-block

Shown when the consistency section of the review reports a `partial` or `severe` verdict, and the divergence leaves a PR-description claim to reconcile. The consistency section renders only when two spec sources are present (ticket and PR description), so this sub-block appears in PR reviews. The case (which spec source the implementation matches) is drawn from the consistency-section table; see `review-branch/SKILL.md` § Specification consistency.

This sub-block edits the PR description alone. A ticket delta derives from in-conflict criteria rows, which are the [Deviations sub-block](#deviations-sub-block)'s trigger, so a ticket edit offered here would duplicate that sub-block's preview and menu for one decision. Case 3 (the ticket is the stale source) therefore renders nothing of its own: Where its divergence rests on a criterion, Deviations proposes the edit, and where it rests on a narrative section, the ticket's authoring-time record stands and nothing is proposed.

#### Options

The options are:

| Emoji | Option                | Action                                              |
| ----- | --------------------- | --------------------------------------------------- |
| 📝    | Update PR description | Edit the PR description to match the implementation |
| ⏭️    | Leave as-is           | Accept the divergence                               |

Every case that renders offers both, so the pair is fixed; what varies by case is which marker each takes.

#### Output format

Render the list per [option format](#option-format). Each option has a marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option takes the strongest marker per case. Option 1 renders its PR-description delta above the list, per [proposed-edit preview](#proposed-edit-preview); "Leave as-is" has none. Pros and cons are omitted by default; add a `➕` or `➖` line only when the specific divergence presents a tradeoff that survives the option-format tests (e.g., "the diverging AC was load-bearing for adjacent work that has already shipped"). Generic restatements are noise and must be omitted. That default applies to pros and cons alone: It never suppresses the proposed-edit preview, which is required content.

Case 2 (implementation matches ticket; PR description is the stale source):

```
Source divergence:

Proposed edit to the PR description:
- D2: "Retries use a fixed 200ms delay" → "Retries use exponential backoff from 200ms"

1. 📝 ■■□ Update PR description
2. ⏭️ ■□□ Leave as-is
```

Case 3 (implementation matches PR description; ticket is the stale source) renders nothing; see [the sub-block's own scope](#source-divergence-sub-block).

Case 4 (implementation matches neither source, severe) renders the same pair as case 2, marker-free: The reviewer cannot tell whether the code or the specs are the wrong one, so it recommends neither. The "code is wrong" path is not offered here: The review's findings already surface a divergence when the code is at fault, and disposing of those findings is the author's job (see the Findings sub-block).

Source-divergence options preserve conversation context, and the preview each renders binds the reconciliation that follows, per [proposed-edit preview](#proposed-edit-preview).

#### Recommendation rules

In the typical flow, the ticket is written first and rarely revised, while the PR description describes the implementation as built. When the two diverge and the implementation matches one of them, the unmatched source is the stale one; update it to match reality. When the implementation matches neither (severe), the reviewer cannot attribute the fault, so the menu offers only ratification of the PR description and leaves the code-is-wrong path to the findings.

Determine the case from the implementation column of the consistency-section table:

| Implementation column shows                   | Verdict      | Case | Recommended option     |
| --------------------------------------------- | ------------ | ---- | ---------------------- |
| `🟢 ticket, 🟠/🔴 PR` on every divergent row  | 🟠 `partial` | 2    | Update PR description  |
| `🟠/🔴 ticket, 🟢 PR` on every divergent row  | 🟠 `partial` | 3    | None (does not render) |
| `🟠/🔴 ticket, 🟠/🔴 PR` on any divergent row | 🔴 `severe`  | 4    | None (marker-free)     |

#### Marker strengths

For case 2, the recommended option's marker follows how cleanly the case's own test is met: ■■■ where the divergence is unambiguous and the PR description is plainly the stale source, ■■□ where which source leads is arguable. The other option takes ■□□. Case 4 has no markers.

### Findings sub-block

Shown when the review has at least one finding.

There is no tier condition, and none should be reintroduced. Every finding a review emits has already cleared the [Actionability gate](../_data/artifact-conventions.md#actionability-gate), which requires it to hand the author a concrete decision they can act on; anything producing no decision was dropped before it reached the artifact. Severity orders how findings rank and what blocks merge. It never decides whether they are shown, or whether the user is offered a way to act on them.

Stating the trigger as a list of tiers is the failure this rule replaces: An enumeration goes stale the next time the finding scheme moves, and silently withdraws the menu from whichever tier it omits.

Legacy (`-L`) findings trigger the sub-block on the same terms, with the full option pool. Do not trim the author hand-offs for a legacy-only review: That would leave implementing-in-place as the only route and forfeit the adversarial second look, which pre-existing code needs at least as much as authored code, since no ticket criterion constrains a legacy fix and no design discussion supports it. The recommendation rules route legacy without a carve-out: A legacy fix naming its exact edit satisfies rule 2 like any other, and one that does not falls through to a ticket or a hand-off.

The option set depends on whether the review covers a pull request. Select the variant by the review the agent just produced: A `review-pr` run has a PR reference in the review header and a PR-description spec source, and its author is typically someone else; a `review-branch` run has neither, and its code is typically our own.

#### Options: Local-branch variant (review-branch)

| #   | Emoji | Option                                                      | Description                                                                                                              |
| --- | ----- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | 🚀    | Implement directly                                          | Fix the findings in this session                                                                                         |
| 2   | 📋    | Ask the author to address the findings                      | Hand the findings to the author for disposition                                                                          |
| 3   | 📋🔍  | Wait for the author to address the findings, then re-review | Wait for the author's fixes, then re-review the branch                                                                   |
| 4   | 🎫    | Create a follow-up ticket                                   | Spin the separable findings into their own ticket, per `scope-and-deferral.md`; the rest route by the next matching rule |

#### Options: PR variant (review-pr)

| #   | Emoji | Option                    | Description                                                                                                                                                                                     |
| --- | ----- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 📋    | Post findings on the PR   | Post the findings as comments anchored to file and line. On Bitbucket, use whatever Bitbucket tooling is available (MCP server, REST API, CLI); GitHub has no posting mechanism yet (see #1018) |
| 2   | 🚀    | Implement directly        | Fix the findings in this session                                                                                                                                                                |
| 3   | 🎫    | Create a follow-up ticket | Spin the separable findings into their own ticket, per `scope-and-deferral.md`; the rest route by the next matching rule                                                                        |

#### Output format

Render the list per [option format](#option-format). Each option has a marker (■■■/■■□/■□□/□□□); the recommendation rules below determine which option takes the strongest marker. Pros and cons are omitted by default: Add a `➕` or `➖` line only when the specific findings present a tradeoff that survives the option-format tests bearing on which option fits (e.g., "the fixes touch a shared contract used outside this package"). Generic option properties are noise and must be omitted.

**Naming the ticket's subset.** When only some open findings clear rule 1's spin-off bar, the follow-up-ticket line names the ones it would cover, as `Create a follow-up ticket for R2, S1`. Choosing it disposes of those findings alone. In this case the ticket option composes with the recommendation rather than replacing it: The cascade's remaining rules run on the findings the ticket does not cover, the option they select is the one marked, and answering with both numbers disposes of every open finding. A ticket option covering every open finding renders bare.

Local-branch variant, rendered for a review whose findings are all discretionary and all determinate:

```
Next steps:

Actionable findings:
1. 🚀 ■■□ Implement directly
2. 📋 ■□□ Ask the author to address the findings
3. 📋🔍 ■□□ Wait for the author to address the findings, then `review-branch`
4. 🎫 ■□□ Create a follow-up ticket

If the author is an agent, run `respond-to-review` in that session.
```

Local-branch variant, rendered where the findings pose a design question the author owns:

```
Next steps:

Actionable findings:
1. 🚀 ■□□ Implement directly
2. 📋 ■■□ Ask the author to address the findings
3. 📋🔍 ■□□ Wait for the author to address the findings, then `review-branch`
4. 🎫 ■□□ Create a follow-up ticket

If the author is an agent, run `respond-to-review` in that session.
```

Local-branch variant, rendered where three determinate suggestions appear next to one separable recommendation:

```
Next steps:

Actionable findings:
1. 🚀 ■■□ Implement directly
2. 📋 ■□□ Ask the author to address the findings
3. 📋🔍 ■□□ Wait for the author to address the findings, then `review-branch`
4. 🎫 ■□□ Create a follow-up ticket for R2

If the author is an agent, run `respond-to-review` in that session.
```

PR variant, rendered for the default case:

```
Next steps:

Actionable findings:
1. 📋 ■■□ Post findings on the PR
2. 🚀 ■□□ Implement directly
3. 🎫 ■□□ Create a follow-up ticket
```

Per the session-boundary rule, two options name a skill in the render:

- **Ask the author to address the findings**: The author's disposition happens in another session. The separate line below the list names `respond-to-review` for the case where that author is an agent.
- **Wait for the author to address the findings, then re-review**: Names `review-branch` in the render, because the re-review runs after a wait only the user can end. It has no "Clear context" prefix, since the reviewer's memory of what it found is what lets it check the fixes.

#### Recommendation rules

Both variants share one cascade. Check the rules in order and stop at the first match. Every rule states a firing condition, and no option is a default that fires for want of one: A conditionless option outranks a conditioned one in practice, however the conditions are worded.

1. **Create a follow-up ticket**: Every open finding clears one of [`scope-and-deferral.md`](../_data/scope-and-deferral.md)'s affirmative reasons for spinning off, namely a genuinely separable concern, a materially different risk surface, size that would overwhelm the current change, or independent prioritization. "The ticket didn't mention it" is never such a reason. Absent an affirmative reason the fold-in default applies and the cascade continues.
2. **Implement directly**: Every open finding is determinate, meaning its Recommendation states the exact change and applying it needs no judgment its author would have to supply. Implementing forfeits the second look, and determinacy is what makes that acceptable: The fix's diff is the finding restated, so a reviewer would be re-reading text the review already contains. A finding posing a question rather than naming an edit is not determinate, however small it looks.
3. **Wait for the author to address the findings, then re-review**: The findings need judgment the author owns, and the fixes are substantial enough that the result needs another review pass. PR variant: Skip this rule.
4. **Ask the author to address the findings**: residual. The reviewer surfaces; the author disposes. PR variant: **Post findings on the PR**, since the author is typically someone else and comments on the PR are how the findings reach them.

Every rule tests the open findings as a collection, which is what lets one recommendation stand for the set. When only some findings clear rule 1's spin-off bar, the cascade evaluates the remainder: The recommendation comes from the findings that stay, while the separable ones go to the follow-up-ticket option, whose rendered line names them.

Discretionary and determinate are independent axes. Whether a change is optional is a different question from who decides it: An `S` reading "rename `x` to `descriptiveName`" is discretionary but fully determinate, since the only decision left is yes or no and the person reading the menu is the one making it. Routing that to the author round-trips a settled edit through a second session.

Do not attempt to detect whether the author is the person reading the review. Agents commit under the user's git identity, so the review's resolved `$author` cannot distinguish them. Rule 2 turns on the review's own content, which is decidable.

#### Marker strengths

The selected option's marker follows how cleanly its rule matched: ■■■ where the rule's test is met squarely and the alternatives are worse on the criteria that decided it, ■■□ where the fit is good but an alternative stays defensible, ■□□ where little separates the options. The others take ■□□ by default, and □□□ where one carries a clear drawback in the current context.

Complexity levels classify individual findings, but the recommendation applies to the collection.

Where the cascade's conditions leave two options genuinely in balance, prefer the one that keeps a human in the loop. That resolves a tie and nothing more: It never overrides a rule that fired, and a fix that satisfies rule 2's determinacy test is not a tie.

### Combined output format

When multiple sub-blocks are shown, present them as separate sections within a single next-steps block. Ordering is Deviations → Source divergence → Actionable findings. The two sub-blocks edit different artifacts, so selecting both runs each edit against its own preview. Source divergence appears only in PR reviews, so a block that includes it renders the Findings PR variant. The example below illustrates one such arrangement; each sub-block's recommendation rules and marker strengths determine which marker applies to each option:

```
Next steps:

**A1: Deviations from ticket**

Proposed edit to the acceptance criteria:
- Drop: A `--strict` flag gates the new validation

1. 📝 ■■□ Update the acceptance criteria on {ticket_ref}
2. ⏭️ ■□□ Leave as-is

**A2: Source divergence**

Proposed edit to the PR description:
- D2: "Unknown directives are warned on" → "Unknown directives fail the run"

1. 📝 ■■□ Update PR description
2. ⏭️ ■□□ Leave as-is

**A3: Actionable findings**
1. 📋 ■■□ Post findings on the PR
2. 🚀 ■□□ Implement directly
3. 🎫 ■□□ Create a follow-up ticket
```
