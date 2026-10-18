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

**Proceed provisionally.** Do everything that does not depend on an answer first, and raise an ask only when the work is blocked or at the skill's checkpoint. When a gated decision has a strong recommendation, build on it, mark it ⏳ as "Record what you did not ask" states, and ask at the checkpoint; revise if overruled. In a skill without a phase structure, treat the skill's own approval gate, or the end of its work, as the checkpoint.

**Batch, never stream.** Collect the asks that survive the gate into one review at the checkpoint, not one per turn.

**Record what you did not ask.** Write every decision that the gate let you take into the plan's `## Decisions taken` section, with a one-line reason; when the work does not have a plan, write it into the turn's summary. Always record: A silent decision is worse than an ask. Start each line that states a decision awaiting the checkpoint with ⏳, wherever you state it: in the record, and in a turn's narrative, such as a checkpoint summary or a list of decisions. The marker lets the developer find what they may overrule without reading every line. Drop it once the developer approves the checkpoint at which the decision was presented.

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

1. For each alternative, look for the cost that disqualifies it, including one that follows from the constraints and acceptance criteria of the work at hand, and state that cost as the alternative's `➖`.
2. For each `➖` on the strongest-marked option, name the reader who would choose differently because of it. Cut the bullet if there is none.
3. Re-mark the options. When every alternative has a disqualifying `➖`, mark the leader ■■■. The observed bias is a marker set too weak, not one set too strong.
4. Re-apply the gate. Outside the gated class, a leader marked above every other option means that the field is decided: State the decision in one line, and do not render a menu. Inside the class, render the menu with the leader's marker as the check set it.

**Identify each question** when a single response contains 2 or more option-style questions: Prefix them `Q1`, `Q2`, and so on, so that the user can reference answers unambiguously. When the underlying data already has stable identifiers (plan-review findings such as `C1` or `X2`), use those in place of `Q1`/`Q2`. For a single option-style question, omit the identifier. Inside an [action-items block](../_data/action-items.md), identifiers are mandatory whenever the block contains more than one item (or more than one independently-numbered list), and they distinguish actions (`A`) from questions (`Q`).

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
