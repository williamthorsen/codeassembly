# Action items

The user runs several sessions at once and skims. An ask stated only in the prose is an ask missed, and a response with no block tells the user the turn needs nothing from them.

The render contract comes first; the doctrine behind it follows. Skills that close a turn by asking include the contract inlined, so what they consult here is the doctrine.

<!-- include: ../_partials/action-items.md / -->

## Sweep before sending

The failure this convention prevents is not bad formatting. It is an ask the agent never recognized as an ask, so no formatting rule ever applied. Before ending a turn, scan the draft for anything that invites a response and move every hit into the block.

Soft offers are the hardest form to spot. Each phrases a question as a statement:

- "let me know if…"
- "say the word and I will…"
- "worth knowing…"
- "I can also…"
- "happy to…"
- "if you'd like…"
- "I've not done X" (leaving the offer implicit)

Each is an action item. Restate it in the block as the concrete action it proposes, and strike the offer from the prose. The observation that prompted it may stay — that is signal. The ask may not.

## Items

An item is a question, punctuated as one, naming the concrete action:

- **This:** "Add the packaging note to #977?"
- **Not this:** "Should I do something about the trap?" — vague. The user cannot answer without first asking what you mean.
- **Not this:** "Add the packaging note to #977." — declarative. It reads as a statement of what you are about to do, and pre-empts the decision that is the user's to make.

**Naming side effects.** An ask that authorizes a consequential, hard-to-reverse side effect — deleting a remote branch, force-pushing, closing an issue — must name it in the ask text, not only in metadata beside it. Consent extends only to what the ask names — for the human, and for a permission auto-classifier, which reads the ask text and nothing around it.

### Kinds

| Prefix | Kind                                                                                        | Marker                                                            |
| ------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `A`    | An action you propose to take: A "yes" makes you act.                                       | `👍🏼👎🏼`, or a numbered gradient list when several actions compete. |
| `Q`    | Information or a judgment you need: A "yes" only informs you; nothing happens on your side. | `🤔`                                                              |

The prefix follows from the marker, so choosing it requires no classification the agent was not already making. A-items come first: They are what the turn is blocked on.

A statement that is not an ask (a status note, a merge-ready report) is neither `A` nor `Q`; it stays in the prose, never the block. The prefix and marker always agree: An `A` never takes `🤔`, a `Q` never takes `👍🏼👎🏼`.

A bare numeral belongs to the options under an item, so an identifier never collides with an option number and a reference is never ambiguous. The user answers the whole block in one line — "A1 y, A2 2". A single-item block has no prefix, since there is nothing to disambiguate.

**Blocks with more than one list.** A canonical block can contain several independently-numbered lists, such as a next-steps menu offering a remote-issue select and a next-action select. Each list is an item, so the render contract's identifier rule applies to it unchanged: Canonical blocks are not exempt, and a bare `Remote issue:` label is not an identifier the reader can cite.

**The multi-select variant.** One block shape numbers differently on purpose: a single multi-select of atomic actions, where the user picks any subset ("reply with numbers, or 'all'"). Its actions have no options of their own, so the bare numbers are themselves the identifiers, and `1a`/`1b` marks two mutually-exclusive alternatives sharing one slot. `wrap-up`'s action menu is the exemplar. The letter prefix is what a single-select list needs and a multi-select does not: In the first it separates the list identifier from the option numbers beneath it; in the second there are no option numbers to separate it from.

## Rendering

The block is the last element of the response, under a bolded label, separated from the prose by a horizontal rule. Options follow [recommendation-gradient](./recommendation-gradient.md).

Structure is fixed at three tiers — item, options, reasoning — and never goes deeper. One level of nesting is the deepest that renders reliably in a terminal, so the convention is written never to need a second.

## Deference

Where a skill defines a canonical presentation for its action items, that block takes precedence for the turn. An ad-hoc ask joins it rather than opening a second one; a response never ends with two competing blocks. The next-steps menus after a plan and after a review, `assess-ticket`'s follow-up actions, and `wrap-up`'s action menu are canonical blocks — but the test is whether the skill defines the presentation, not whether it appears here.

A canonical block keeps its own identifiers. Where its items already have stable ids — `refine-plan` keys each question to a plan-review finding such as `C1` or `X2` — those ids identify the items, and the `A`/`Q` prefixes do not displace them.

## Worked example

**Before** — the ask opens as an aside, names no concrete action, and appears mid-paragraph several hundred words into a report:

> Worth knowing for #977: `agents` and `mcp` will hit the same trap. A `files: ["bin", "dist"]` allowlist is not sufficient on its own, because the compiler's ignore list and the packer's allowlist don't agree about what counts as test code. I've not added that to the ticket — say the word and I will.

**After** — the observation stays in the prose, where it is signal; the ask moves to the block, where it can be found and answered:

> The packaging trap is not unique to this package: `agents` and `mcp` have the same shape, because the compiler's ignore list and the packer's allowlist disagree about what counts as test code.
>
> ---
>
> **Action items**
>
> Add a note to #977 recording that `agents` and `mcp` share this trap, and that a `files: ["bin", "dist"]` allowlist is not sufficient on its own? 👍🏼👎🏼
