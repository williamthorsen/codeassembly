# Recommendation gradient

For numbered clarifying questions with 2+ options, mark each option with a strength gradient and a brief rationale. Skip this format for yes/no questions and for next-steps menus (those use their own `🟢 recommended` convention).

## Markers

| Marker | Label                | When to use                                                                              |
| ------ | -------------------- | ---------------------------------------------------------------------------------------- |
| ■■■    | strongly recommended | You'd actively push back if the developer picked otherwise. Reserve for clear-cut cases. |
| ■■□    | recommended          | Your lean. Default level when you have a preference.                                     |
| ■□□    | weakly recommended   | A slight edge; mostly preference.                                                        |
| □□□    | not recommended      | Clear drawbacks; included for completeness or to rule out explicitly.                    |

If you have no preference (pure taste call), omit markers from every option. Don't explain the omission — the absence is the signal.

Render markers as plain text, never inside backticks — backticks shrink the glyphs and hurt readability.

## Ranking criteria

Rank options on correctness — behavior, API quality, architectural soundness, testability, maintainability — and treat convenience considerations (effort, blast radius, consistency with existing code) as secondary. See [design priorities](./design-priorities.md) for the full rule and a before/after example.

## Format

Marker, then option title and colon. Each pro (`➕`) and con (`➖`) goes on its own line, indented by 3 spaces. Apply this even when an option has only one pro or con. Lead with the strongest argument. Use semicolons between items and a period on the last.

## Examples

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

```
Want me to:
1. Use camelCase:
   ➕ matches the host file's local style.
2. Use kebab-case:
   ➕ matches the package's public API style.
```

## Don'ts

- No tiebreaker text for equal-strength options. The developer picks the number.
- No partial marking. Once any option carries a marker, every option carries one.
- Cap at ■■□ unless you'd push back. Use ■■■ only when you'd actively object if the developer chose otherwise.
