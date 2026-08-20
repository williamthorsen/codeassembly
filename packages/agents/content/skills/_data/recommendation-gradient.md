# Recommendation gradient

For numbered option-style questions with 2 or more choices, mark each option with a strength gradient and a brief rationale. The gradient applies to every list with substantive tradeoffs, including templated next-steps menus and substantive binary choices.

The render contract comes first; the doctrine behind it follows. Skills that ask option-style questions include the render contract inlined, so what they consult here is the doctrine.

<!-- include: ../_partials/option-format.md / -->

## Why the gate comes first

Asking is not a neutral act. It is cheap for the agent (it discharges responsibility for the call, forecloses being wrong, and costs one paragraph) and expensive for the developer, who must load the context, evaluate the options, and answer. A menu the agent could have resolved itself transfers cost from the cheap side to the expensive one, and it looks like diligence while it happens, which is why it goes unnoticed and recurs. That asymmetry, rather than politeness or thoroughness, governs whether a question is asked at all.

A wrong-but-stated recommendation is cheaper to correct than a decision handed back: Correcting one costs a word, answering one costs an evaluation. "When in doubt, ask" is therefore the expensive default, not the safe one.

The gate and the marker are one rule seen twice. A menu that survives the gate is one the developer's values or authorization decide, and the agent may still hold a strong evidence-based ranking inside it, which is exactly where ■■■ is honest. A marker held below the strength actually available tells the developer nothing, and leaves them investigating every menu to find the few that are real forks.

## Why a manufactured bullet costs more than none

Bullets in an option list are weighted equally by construction; there is no minor bullet. Placing a line under `➖` asserts that the reader should weigh it, so they spend attention deciding how much it matters. For a manufactured con the answer is none, and the cost is paid before the worthlessness is discovered. That is what makes it waste rather than merely noise.

The con is also load-bearing for the menu's existence: An option recommended with no drawback reads as a decision rather than an option, so dressing a settled call as a fork requires inventing one. A fabricated con is the tell that the gate above was skipped, not an independent formatting slip.

Where the honest cost is hard to find, that difficulty is itself evidence the option is strong. Spend the effort on finding the real cost or on omitting the bullet, never on manufacturing a plausible-sounding one.

## Confirmation prompts vs. substantive binaries

Reserve `👍🏼👎🏼` for confirmation prompts, where the agent has proposed a single action and the user's response is approve-or-redirect. "No" means "let's adjust or discuss," not a concrete alternative agent action.

A yes/no choice where both paths have substantive tradeoffs takes the gradient with two numbered options instead. "No" then designates a concrete alternative agent action with its own consequences worth weighing.

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

Rank options on correctness (behavior, API quality, architectural soundness, testability, maintainability) and treat convenience considerations (effort, blast radius, consistency with existing code) as secondary. See [design priorities](./design-priorities.md) for the full rule and a before/after example.

## Where these lists appear

An option-style question is rendered inside an [action-items block](./action-items.md), the terminal block that ends every response with an ask.

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
**Q1: Naming convention?**
1. Use camelCase:
   - ➕ matches the host file's local style
2. Use kebab-case:
   - ➕ matches the package's public API style

**Q2: File location?**
1. ■■□ Co-locate with consumer:
   - ➕ keeps related code close
2. ■□□ Place in shared utility module:
   - ➕ reusable across packages
```
