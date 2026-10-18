# Recommendation gradient

For numbered option-style questions with 2 or more choices, mark each option with a strength gradient and a brief rationale. The gradient applies to every list with substantive tradeoffs, including templated next-steps menus and substantive binary choices.

The render contract comes first; the doctrine behind it follows. Skills that ask option-style questions include the render contract inlined, so they consult this file only for the doctrine.

<!-- include: ../_partials/option-format.md / -->

## Why the gate comes first

Asking is not a neutral act. It is cheap for the agent (it discharges responsibility for the call, rules out being wrong, and takes one paragraph) and expensive twice over: The developer must switch context to load the context, weigh the options, and answer, and the session that asked idles until the answer arrives. Across a dozen concurrent sessions those costs compound into decision fatigue and a stalled pipeline. A menu that the agent could have resolved itself transfers cost from the cheap side to the expensive one, and it looks like diligence while it happens, which is why it goes unnoticed and recurs.

The gate reads the markers rather than asking for judgment, because a step that says to ask overrides a judgment gate: An agent following a step list executes the step, and a rendered ■■■ makes the ask feel legitimate. The gate is only as reliable as the markers that it reads, and the observed bias is a marker set too weak: An option whose alternatives have disqualifying flaws gets ■■□, and the menu renders. The contract's leader check corrects that before the gate reads the markers. Two ■■□ at the top is a real fork, an unmarked list is a preference, and every other field is decided. The gated class is a closed list for the same reason: "consequential" is read generously, and a list is not.

The leader check is not only for the gate. A gated decision renders its menu whatever the markers say, so a check read as deciding whether a menu renders looks pointless there and is skipped. The marker still does its other job: It tells the developer how much deliberation the ask needs. A leader marked ■■□ above a disqualified alternative reads as a close call, and the developer must re-derive the analysis to find out that the alternative was never viable before approving. An honest ■■■ lets them approve at a glance. A cost that disqualifies an alternative often follows from the constraints or the acceptance criteria of the work at hand rather than from the option itself, which is why the check searches each alternative for such a cost before marking.

A real fork is a choice between acceptable options, not doubt about a fact. On one change, the agent applied the work-type test and resolved the change to `feat`, then rendered one entry's typing, `feat` against `fix`, as a menu marked ■■□ on both options. The agent had the diff, the commits, the taxonomy, and the test that decides the type; the developer had the summary bullets, and answering meant reloading all of it to give a worse-informed answer than the agent's. The type has one right answer under the test, and the closeness of the two candidates was doubt about which one the test yields. The correct handling is a decision: Apply the test, pick, state the reason in one line, and let the pull-request body show the type before anything is published.

A wrong-but-stated recommendation is cheaper to correct than a decision handed back: Correcting one takes a word; answering one takes an evaluation and a wait. The record keeps the developer's veto and makes it cheaper to use. They read the record and overrule the entries with which they disagree, and the session has kept working in the meantime. "When in doubt, ask" is therefore the expensive default, not the safe one, and "when in doubt, record" is the rule that replaces it.

The gate and the marker are one rule seen twice. A menu that passes the gate is one that the markers could not settle or one that the developer authorizes, and the agent may still have a strong evidence-based ranking inside an authorization menu, which is exactly when ■■■ is honest. A marker set below the strength actually available tells the developer nothing, and leaves them investigating every menu to find the few that are real forks.

## Why a manufactured bullet costs more than none

Bullets in an option list are weighted equally by construction; the format does not provide a minor bullet. Placing a line under `➖` asserts that the reader should weigh it, so they spend attention deciding how much it matters. For a manufactured con the answer is none, and the reader spends that attention before discovering that the con is worthless. That makes it waste rather than merely noise.

The menu's existence also depends on the con: Because an option recommended without a drawback reads as a decision rather than an option, presenting a settled call as a fork requires inventing a drawback. A fabricated con is the sign that the gate above was skipped, not an independent formatting slip.

When the honest cost is hard to find, that difficulty is itself evidence the option is strong. Spend the effort on finding the real cost or on omitting the bullet, never on manufacturing a plausible-sounding one.

A menu that looks balanced when the options are not misreports the analysis: It tells the developer that the agent found a close call. The developer relies on the menu for objective advice, and an even-handed look is the opposite of that when one option is sound and the others are flawed. A con whose size the reader cannot see does the same damage in a smaller form, since the reader has to investigate to learn that it is trivial. Both failures recur after being named, because a menu with a con on every option looks diligent while it misleads.

## Confirmation prompts vs. substantive binaries

Reserve `👍🏼👎🏼` for confirmation prompts, in which the agent has proposed a single action and the user's response is approve-or-redirect. "No" means "let's adjust or discuss," not a concrete alternative agent action.

A yes/no choice in which both paths have substantive tradeoffs takes the gradient with two numbered options instead. "No" then designates a concrete alternative agent action with its own consequences worth weighing.

Same surface phrasing, two correct renderings:

**Procedural (confirmation prompt):**

> Apply these revisions? 👍🏼👎🏼

"No" leads to discussion or revision; the prompt does not enumerate an alternative action.

**Substantive (gradient list):**

> #412 asks for the flag that this change adds, and also for a short alias that the change does not add. Want me to:
>
> 1. ■■□ Close #412 as superseded by this change:
>    - ➖ the alias request closes with it, and it is not tracked by any other ticket
> 2. ■■□ Leave #412 open, retitled to the alias:
>    - ➖ its 30 comments about the shipped flag bury the one about the alias

Both "yes" (close) and "no" (retitle) are concrete agent actions with their own tradeoffs. The decision edits a remote ticket, so it is in the gated class and is asked whatever the markers say.

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
1. ■■□ Co-locate with its only consumer:
   - ➕ the check changes together with the form that it validates
2. ■■□ Place in the shared utility package:
   - ➕ the billing package needs the same check once #588 lands
```
