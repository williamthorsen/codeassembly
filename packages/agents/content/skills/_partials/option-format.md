## Option format

**Earn the menu before rendering it.** A menu is for a call you cannot make. Before composing options, settle whose call it is:

- **Yours**: The ranking follows from evidence you already hold: correctness, a codebase convention, or a governing document that already decided it. State the decision in one line with its reason and proceed. The rejected alternative belongs in a clause ("X rather than Y, because Z"), never as a numbered option awaiting selection.
- **The user's**: The ranking turns on a preference, a priority, a risk appetite, or a budget only they hold. Render the menu.

Sequencing and scheduling rank that way without exception: when to do queued work, whether a finished change ships now or rides with a later one, whether to hold work pending a change in another repository. Measuring an option's cost does not move the call to your side, because elapsed time and round trips are priced on your ledger, where the user's context switch and review cycles cost nothing. A more accurate number on the wrong ledger still cannot rank the options. Present the cost, render the options unmarked, and let the user choose.

This gate governs judgment asks alone. An ask that authorizes a consequential or hard-to-reverse action (creating a branch, pushing, editing a ticket, advancing a pipeline) belongs to the user however confident you are, and is never collapsed into a stated decision. Templated next-steps menus survive the gate for the same reason: What to do next is the user's call about their own time.

Asking is not neutral. It is cheap for you and expensive for the user, who must load the context, weigh the options, and answer. A wrong-but-stated recommendation costs them a word to correct; a decision handed back costs them an evaluation. Where the call is close, decide.

Render every option-style question in this form: any numbered list of 2 or more choices with substantive tradeoffs, including templated next-steps menus and yes/no choices where both paths are concrete actions. Reserve `👍🏼👎🏼` for confirmation prompts, where a single action has been proposed and "no" means "let's adjust or discuss" rather than a concrete alternative.

**Number every option**: `1.`, `2.`, `3.` The number is how the user selects. Never render the options as bullets or bare prose.

**Mark every option with a strength marker.** The recommended option is the one with the strongest marker. There is no separate "I recommend option N" sentence, and a recommendation that does not match the strongest marker is a defect.

| Marker | Label                | When to use                                                                                                                              |
| ------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| ■■■    | strongly recommended | One option is clearly better on the criteria governing the decision, and your ranking does not turn on a preference only the user holds. |
| ■■□    | recommended          | Your lean. Default level when you have a preference.                                                                                     |
| ■□□    | weakly recommended   | A slight edge; mostly preference.                                                                                                        |
| □□□    | not recommended      | Clear drawbacks; included for completeness or to rule out explicitly.                                                                    |

Marking is all-or-none: Once any option has a marker, every option has one. With no preference (a pure taste call), omit markers from every option and don't explain the omission; the absence is the signal. Mark at the strength you actually hold: A marker that reads the same whatever the analysis found carries no information, and the whole cost of telling a real fork from a formality falls on the reader. Render markers as plain text, never inside backticks; backticks shrink the glyphs and hurt readability.

**Format each option** as marker, then title, then a colon. Each pro (`➕`) and con (`➖`) is a nested list item beneath its option, with no terminal punctuation. Apply this even when an option has only one pro or con. Lead with the strongest argument.

Every line subordinate to an option (a pro, a con, invocation guidance) is a nested list item, never a whitespace-indented continuation. Indentation by spaces, ASCII or non-breaking alike, does not survive terminal rendering: The lines collapse to the left margin, and the reader cannot tell which reason belongs to which option. Markdown structure survives; whitespace does not.

Nesting stops at one level. An option never contains sub-options, and a pro never contains a sub-pro. Deeper nesting is where terminal rendering stops being reliable, so this contract is written never to need it.

**Write only bullets that are real.** A `➕` or `➖` asserts that the reader should weigh it, and bullets render at equal visual weight, so a manufactured one reads exactly like a load-bearing one and costs a round trip to discover it was empty. Four tests:

- **Falsifiability.** A `➖` must be false for at least one other option on the menu, and a `➕` likewise. Anything that would still be true if this were the only option is a mechanic of carrying it out rather than a tradeoff; it belongs on the invocation line or nowhere.
- **Decision weight.** Would a reader who believed this bullet choose differently? Bookkeeping, mechanically-implied, and trivially-reversible consequences (a doc line to update, a criterion to reword, a rename to propagate) are real, specific, and decision-irrelevant. Restatements of an option's inherent properties ("longer wall time", "structured review pass", "ships faster") are one instance of the same failure.
- **The qualifier tell.** A bullet undercut by its own qualifier ("negligible", "inert", "harmless") is filler. Cut it rather than soften it.
- **Check before you hedge.** Where a cheap check would settle whether a con is real, run the check. Shipping the uncertainty as a bullet transfers the check to the user.

Asymmetry is a report, not a defect. An option with three real pros and no real con gets three pros and no con. Never add a bullet to fill a slot, reach parity between options, or avoid looking one-sided; where the honest cost is hard to find, that difficulty is itself evidence the option is strong. Where no option has a real bullet, omit them all and let the markers carry the recommendation. Add no tiebreaker text for equal-strength options; the developer picks the number.

A `□□□` option keeps the `➖` that explains why it was ruled out. Under the falsifiability test that bullet is real by construction, and without it the reader holds a veto they cannot check.

**Identify each question** when a single response contains 2 or more option-style questions: Prefix them `Q1`, `Q2`, and so on, so the user can reference answers unambiguously. Where the underlying data already has stable identifiers (plan-review findings such as `C1` or `X2`), use those in place of `Q1`/`Q2`. For a single option-style question, omit the identifier. Inside an [action-items block](../_data/action-items.md), identifiers are mandatory whenever the block contains more than one item (or more than one independently-numbered list), and they distinguish actions (`A`) from questions (`Q`).

Example:

```
Want me to:
1. ■□□ Use a single config file:
   - ➕ minimal surface area
   - ➖ couples concerns
2. ■■■ Split into two configs:
   - ➕ separates lifecycle and runtime concerns
   - ➕ matches existing repo pattern
3. □□□ Use three configs:
   - ➖ over-decomposed for current scope
```
