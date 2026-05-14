# Recommendation gradient

> **Note for maintainers:** Several skill bodies — including `collaboration/SKILL.md`, `design-and-plan/SKILL.md`, and `refine-plan/SKILL.md` — contain pointers back to this file at their question-asking steps. Those pointers duplicate the universal rule in `AGENTS.md` _intentionally_: agents follow behavioural rules more reliably when the directive sits near the action it governs. Do not remove these pointers during DRY-driven refactors — the redundancy is load-bearing.

For numbered clarifying questions with 2+ options, mark each option with a strength gradient and a brief rationale. Skip this format for confirmation prompts and for next-steps menus (those use their own `🟢 recommended` convention).

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

Marker, then option title and colon. Each pro (`➕`) and con (`➖`) goes on its own line, prefixed with 3 non-breaking-space characters (NBSP, U+00A0) for visual indent — regular ASCII spaces are commonly stripped or normalized in model output, so a visible character is needed to make the indent reliable. Apply this even when an option has only one pro or con. Lead with the strongest argument. Use semicolons between items and a period on the last.

## Question identifiers

When a single response contains 2+ option-style questions, prefix each question with an identifier so the user can reference answers unambiguously (e.g., "Q1: option 2"). Default to `Q1`, `Q2`, etc. When the skill's underlying data already carries stable identifiers — for example, `refine-plan` presents questions tied to plan-review findings like `C1`, `X2` — use those identifiers in place of `Q1/Q2` so the cross-skill mapping is preserved. For a single option-style question, omit the identifier.

## Examples

Single question with markers:

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

Single question without markers (pure taste call):

```
Want me to:
1. Use camelCase:
   ➕ matches the host file's local style.
2. Use kebab-case:
   ➕ matches the package's public API style.
```

Multiple questions in one response (Q1/Q2 identifiers):

```
**Q1 — Naming convention?**
1. Use camelCase:
   ➕ matches the host file's local style.
2. Use kebab-case:
   ➕ matches the package's public API style.

**Q2 — File location?**
1. ■■□ Co-locate with consumer:
   ➕ keeps related code close.
2. ■□□ Place in shared utility module:
   ➕ reusable across packages.
```

## Don'ts

- No tiebreaker text for equal-strength options. The developer picks the number.
- No partial marking. Once any option carries a marker, every option carries one.
- Cap at ■■□ unless you'd push back. Use ■■■ only when you'd actively object if the developer chose otherwise.
