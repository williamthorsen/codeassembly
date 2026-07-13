## Option format

Render every option-style question in this form — any numbered list of 2 or more choices with substantive tradeoffs, including templated next-steps menus and yes/no choices where both paths are concrete actions. Reserve `👍🏼👎🏼` for confirmation prompts, where a single action has been proposed and "no" means "let's adjust or discuss" rather than a concrete alternative.

**Number every option** — `1.`, `2.`, `3.` The number is how the user selects. Never render the options as bullets or bare prose.

**Mark every option with a strength marker.** The recommended option is the one carrying the strongest marker. There is no separate "I recommend option N" sentence, and a recommendation that does not match the strongest marker is a defect.

| Marker | Label                | When to use                                                                              |
| ------ | -------------------- | ---------------------------------------------------------------------------------------- |
| ■■■    | strongly recommended | You'd actively push back if the developer picked otherwise. Reserve for clear-cut cases. |
| ■■□    | recommended          | Your lean. Default level when you have a preference.                                     |
| ■□□    | weakly recommended   | A slight edge; mostly preference.                                                        |
| □□□    | not recommended      | Clear drawbacks; included for completeness or to rule out explicitly.                    |

Marking is all-or-none: once any option carries a marker, every option carries one. With no preference (a pure taste call), omit markers from every option and don't explain the omission — the absence is the signal. Cap at ■■□ unless you would push back; use ■■■ only when you would actively object to any other choice. Render markers as plain text, never inside backticks — backticks shrink the glyphs and hurt readability.

**Format each option** as marker, then title, then a colon. Each pro (`➕`) and con (`➖`) is a nested list item beneath its option, carrying no terminal punctuation. Apply this even when an option has only one pro or con. Lead with the strongest argument.

Every line subordinate to an option — a pro, a con, invocation guidance — is a nested list item, never a whitespace-indented continuation. Indentation by spaces, ASCII or non-breaking alike, does not survive terminal rendering: the lines collapse to the left margin, and the reader cannot tell which reason belongs to which option. Markdown structure survives; whitespace does not.

Nesting stops at one level. An option never contains sub-options, and a pro never contains a sub-pro. Deeper nesting is where terminal rendering stops being reliable, so this contract is written never to need it.

**Keep pros and cons context-specific.** Each `➕` and `➖` speaks to the decision at hand — this plan, these findings, this design choice. Restatements of an option's inherent properties ("longer wall time", "structured review pass", "ships faster") are noise; the option's name and marker already communicate them. Where no context-specific reasoning applies, omit pros and cons entirely — the marker alone is sufficient. Add no tiebreaker text for equal-strength options; the developer picks the number.

**Identify each question** when a single response carries 2 or more option-style questions: prefix them `Q1`, `Q2`, and so on, so the user can reference answers unambiguously. Where the underlying data already carries stable identifiers — plan-review findings such as `C1` or `X2` — use those in place of `Q1`/`Q2`. For a single option-style question, omit the identifier. Inside an [action-items block](../_data/action-items.md), identifiers are mandatory whenever the block holds more than one item, and they distinguish actions (`A`) from questions (`Q`).

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
