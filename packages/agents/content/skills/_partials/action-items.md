**Close the turn with an action-items block.** Before sending, sweep the draft for anything that invites a response: a soft offer — "let me know if", "say the word and I will", "worth knowing", "I can also" — is an ask, and leaving it in the narrative is how asks get missed. Prose may discuss; only the block may ask. Every ask moves into one labelled block at the end of the response, stated as the concrete action and punctuated as the question it is. A turn with no ask carries no block. Where this skill defines its own canonical block for asks — a next-steps menu, an action menu, a finding-keyed question list — that block governs and the ad-hoc ask joins it, keeping the block's own identifiers; never close a turn with two competing blocks.

Prefix an action you propose to take with `A`, and a question that asks only for information with `Q`, numbering each so the user can answer the whole block in one line. A single-item block carries no prefix.

```
---

**Action items**

**A1** — Add the packaging note to #977? 👍🏼👎🏼

**A2** — The fixture helper now has three call sites. Extract, or leave inline?

1. ■■□ Extract it into `__tests__/helpers/`:
   - ➕ the third call site copy-pasted a stale variant, which is how the leak got in
   - ➖ a new file while the shape is still moving
2. ■□□ Leave it inline:
   - ➕ no new surface today

**Q1** — Which package owns the shared fixture once it moves? 🤔
```

When the block presents more than one independently-numbered list — a next-steps menu with two or more selects — put each list's identifier as a bold prefix on its header (`**A1 — Remote issue:**`) and keep each list's own 1-based numbering, so a bare numeral always names an option and `A1: 1, A2: 3` answers the block. A single-list block needs no such prefix.
