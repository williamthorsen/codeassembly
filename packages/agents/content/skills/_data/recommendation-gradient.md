# Recommendation gradient

For numbered option-style questions with 2 or more choices, mark each option with a strength gradient and a brief rationale. The gradient applies to every list with substantive tradeoffs, including templated next-steps menus and substantive binary choices.

The render contract comes first; the doctrine behind it follows. Skills that ask option-style questions carry the render contract inlined, so what they consult here is the doctrine.

<!-- include: ../_partials/option-format.md / -->

## Confirmation prompts vs. substantive binaries

Reserve `👍🏼👎🏼` for confirmation prompts, where the agent has proposed a single action and the user's response is approve-or-redirect. "No" means "let's adjust or discuss," not a concrete alternative agent action.

A yes/no choice where both paths carry substantive tradeoffs uses the gradient with two numbered options instead. "No" then designates a concrete alternative agent action with its own consequences worth weighing.

Same surface phrasing, two correct renderings:

**Procedural (confirmation prompt):**

> Apply these revisions? 👍🏼👎🏼

"No" leads to discussion or revision; there is no enumerated alternative action.

**Substantive (gradient list):**

> Want me to:
>
> 1. ■■□ Extract the helper now:
>    - ➕ enables reuse across the next two call sites
>    - ➖ adds a file and a name to maintain
> 2. ■□□ Keep it inline:
>    - ➕ minimal surface area today
>    - ➖ duplicates the next time the pattern recurs

Both "yes" (extract) and "no" (inline) are concrete agent actions with their own tradeoffs.

## Ranking criteria

Rank options on correctness — behavior, API quality, architectural soundness, testability, maintainability — and treat convenience considerations (effort, blast radius, consistency with existing code) as secondary. See [design priorities](./design-priorities.md) for the full rule and a before/after example.

## Where these lists appear

An option-style question is rendered inside an [action-items block](./action-items.md) — the terminal block that every response carrying an ask ends with.

## Further examples

Single question without markers (pure taste call):

```
Want me to:
1. Use camelCase:
   - ➕ matches the host file's local style
2. Use kebab-case:
   - ➕ matches the package's public API style
```

Multiple questions in one response (Q1/Q2 identifiers):

```
**Q1 — Naming convention?**
1. Use camelCase:
   - ➕ matches the host file's local style
2. Use kebab-case:
   - ➕ matches the package's public API style

**Q2 — File location?**
1. ■■□ Co-locate with consumer:
   - ➕ keeps related code close
2. ■□□ Place in shared utility module:
   - ➕ reusable across packages
```
