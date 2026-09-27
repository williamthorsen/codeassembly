## Option format

**Earn the menu before rendering it.** Mark the options first, then read the markers: Render the menu only when the two strongest options are both ■■□, when the list is unmarked, or when the decision is in the gated class below. Every other field is decided: State the decision in one line with its reason, record it, and proceed. An all-■□□ field is decided too. An unmarked list is a pure-preference call, and a preference is in the gated class. The rejected alternative belongs in a clause ("X rather than Y, because Z"), never as a numbered option awaiting selection.

The gated class is closed. These decisions are asked whatever the markers say:

- the shape of a public API or a contract
- remote shared state: a ticket edit, a push, a merge, the creation of a branch or a ticket
- data loss, or any action that cannot be undone
- spend or budget
- a preference for which you hold no evidence

Everything else is the agent's call by default. A gated action is not decided in the agent's voice: The developer authorizes it; recommend, build on the recommendation provisionally, and ask at the checkpoint. Building on it means doing the work that depends on the answer; the gated action itself waits for the developer's authorization. A templated next-steps menu is in the class, because what to do next is a preference about the developer's time, for which you hold no evidence.

**Proceed provisionally.** Do everything that does not depend on an answer first, and raise an ask only where the work is blocked or at the skill's checkpoint. When a gated decision has a strong recommendation, build on it, mark it provisional in the record, and ask at the checkpoint; revise if overruled. A skill with no phase structure treats its own approval gate, or the end of its work, as the checkpoint.

**Batch, never stream.** Asks that survive the gate collect into one review at the checkpoint, not one per turn.

**Record what you did not ask.** Write every decision that the gate let you take into the plan's `## Decisions taken` section, with a one-line reason, marked `(provisional)` when it awaits the checkpoint; where no plan exists, write it into the turn's summary. Recording is mandatory: A silent decision is worse than an ask.

**Never rank the options by your own elapsed time, round trips, or effort.** You measure these costs yourself, and that measure counts the user's context switch and review cycles as nothing. Measuring one does not make the call yours, and a more accurate measurement still cannot rank the options.

Ordering follows from the gate. When the order changes the code or the total effort -- upstream before downstream, a refactor before the feature that would otherwise be written twice -- recommend it and mark it, naming the delay that it causes and saying nothing about delay when none is involved. When the outcomes are identical and only the timing differs, such as when queued work is picked up, present the cost, render the options unmarked, and put the choice at the checkpoint.

Asking is not neutral. It costs the developer a context switch, and it idles the session until the answer arrives. A wrong-but-stated recommendation costs them a word to correct; a decision handed back costs them an evaluation and costs the session the wait.

Render every option-style question in this form: any numbered list of 2 or more choices with substantive tradeoffs, including templated next-steps menus and yes/no choices in which both paths are concrete actions. Reserve `👍🏼👎🏼` for confirmation prompts, in which a single action has been proposed and "no" means "let's adjust or discuss" rather than a concrete alternative.

**Number every option**: `1.`, `2.`, `3.` The number is how the user selects. Never render the options as bullets or bare prose.

**Mark every option with a strength marker.** The recommended option is the one with the strongest marker. There is no separate "I recommend option N" sentence, and a recommendation that does not match the strongest marker is a defect.

| Marker | Label                | When to use                                                                                                                                   |
| ------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| ■■■    | strongly recommended | One option is clearly better on the criteria governing the decision, and your ranking does not turn on a preference that only the user holds. |
| ■■□    | recommended          | Your lean. Default level when you have a preference.                                                                                          |
| ■□□    | weakly recommended   | A slight edge; mostly preference.                                                                                                             |
| □□□    | not recommended      | Clear drawbacks; included for completeness or to rule out explicitly.                                                                         |

Marking is all-or-none: Once any option has a marker, every option has one. With no preference (a pure taste call), omit markers from every option and don't explain the omission; the absence is the signal. Mark at the strength that you actually hold: A marker that reads the same whatever the analysis found conveys no information, and the reader must do all the work of telling a real choice from a formality. Render markers as plain text, never inside backticks; backticks shrink the glyphs and hurt readability.

**Format each option** as marker, then title, then a colon. Each pro (`➕`) and con (`➖`) is a nested list item beneath its option, with no terminal punctuation. Apply this even when an option has only one pro or con. Lead with the strongest argument.

Every line subordinate to an option (a pro, a con, invocation guidance) is a nested list item, never a whitespace-indented continuation. Indentation by spaces, ASCII or non-breaking alike, does not survive terminal rendering: The lines collapse to the left margin, and the reader cannot tell which reason belongs to which option. Markdown structure survives; whitespace does not.

Nesting stops at one level. An option never contains sub-options, and a pro never contains a sub-pro. Terminal rendering stops being reliable at deeper nesting, so this contract is written never to need it.

**Write only bullets that are real.** A `➕` or `➖` asserts that the reader should weigh it, and bullets render at equal visual weight. A manufactured one reads exactly like a load-bearing one, and it takes a round trip to discover that it was empty. Four tests:

- **Falsifiability.** A `➖` must be false for at least one other option on the menu, and a `➕` likewise. Anything that would still be true if this were the only option is a mechanic of carrying it out rather than a tradeoff; it belongs on the invocation line or nowhere.
- **Decision weight.** Would a reader who believed this bullet choose differently? Bookkeeping, mechanically-implied, and trivially-reversible consequences (a doc line to update, a criterion to reword, a rename to propagate) are real, specific, and decision-irrelevant. Restatements of an option's inherent properties ("longer wall time", "structured review pass", "ships faster") are one instance of the same failure.
- **The qualifier tell.** A bullet undercut by its own qualifier ("negligible", "inert", "harmless") is filler. Cut it rather than soften it.
- **Check before you hedge.** If a cheap check would settle whether a con is real, run the check. Presenting the uncertainty as a bullet transfers the check to the user.

Asymmetry is a report, not a defect. An option with three real pros and no real con gets three pros and no con. Never add a bullet to fill a slot, reach parity between options, or avoid looking one-sided; when the honest cost is hard to find, that difficulty is itself evidence the option is strong. When no option has a real bullet, omit them all and let the markers alone convey the recommendation. Add no tiebreaker text for equal-strength options; the developer picks the number.

A `□□□` option keeps the `➖` that explains why it was ruled out. Under the falsifiability test that bullet is real by construction, and without it the reader is left with a veto that they cannot check.

**Identify each question** when a single response contains 2 or more option-style questions: Prefix them `Q1`, `Q2`, and so on, so that the user can reference answers unambiguously. When the underlying data already has stable identifiers (plan-review findings such as `C1` or `X2`), use those in place of `Q1`/`Q2`. For a single option-style question, omit the identifier. Inside an [action-items block](../_data/action-items.md), identifiers are mandatory whenever the block contains more than one item (or more than one independently-numbered list), and they distinguish actions (`A`) from questions (`Q`).

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
