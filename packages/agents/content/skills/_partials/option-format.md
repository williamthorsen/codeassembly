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

**Format each option** as marker, then title, then a colon. Each pro (`➕`) and con (`➖`) goes on its own line, prefixed with 3 non-breaking-space characters (NBSP, U+00A0) for visual indent — regular ASCII spaces are commonly stripped or normalized in model output, so a visible character is needed to make the indent reliable. Apply this even when an option has only one pro or con. Lead with the strongest argument. Use semicolons between items and a period on the last.

**Keep pros and cons context-specific.** Each `➕` and `➖` speaks to the decision at hand — this plan, these findings, this design choice. Restatements of an option's inherent properties ("longer wall time", "structured review pass", "ships faster") are noise; the option's name and marker already communicate them. Where no context-specific reasoning applies, omit pros and cons entirely — the marker alone is sufficient. Add no tiebreaker text for equal-strength options; the developer picks the number.

**Identify each question** when a single response carries 2 or more option-style questions: prefix them `Q1`, `Q2`, and so on, so the user can reference answers unambiguously. Where the underlying data already carries stable identifiers — plan-review findings such as `C1` or `X2` — use those in place of `Q1`/`Q2`. For a single option-style question, omit the identifier.

Example:

```
Want me to:
1. ■□□ Use a single config file:
   ➕ minimal surface area;
   ➖ couples concerns.
2. ■■■ Split into two configs:
   ➕ separates lifecycle and runtime concerns;
   ➕ matches existing repo pattern.
3. □□□ Use three configs:
   ➖ over-decomposed for current scope.
```
